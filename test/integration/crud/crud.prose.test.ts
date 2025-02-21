import { expect } from 'chai';
import { once } from 'events';

import { type CommandStartedEvent } from '../../../mongodb';
import {
  type ClientBulkWriteModel,
  type ClientSession,
  type Collection,
  type Document,
  MongoBulkWriteError,
  type MongoClient,
  MongoClientBulkWriteError,
  MongoInvalidArgumentError,
  MongoServerError
} from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';
import { filterForCommands } from '../shared';

describe('CRUD Prose Spec Tests', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    await client.connect();
  });

  afterEach(async () => {
    if (client) {
      await client.close();
      client.removeAllListeners();
    }
  });

  // TODO(NODE-3888): Implement this test
  it.skip('1. WriteConcernError.details exposes writeConcernError.errInfo', {
    /**
     * Test that writeConcernError.errInfo in a command response is propagated as WriteConcernError.details (or equivalent) in the driver.
     * Using a 4.0+ server, set the following failpoint:
     * @example
     * ```js
     * {
     *   "configureFailPoint": "failCommand",
     *   "data": {
     *     "failCommands": ["insert"],
     *     "writeConcernError": {
     *       "code": 100,
     *       "codeName": "UnsatisfiableWriteConcern",
     *       "errmsg": "Not enough data-bearing nodes",
     *       "errInfo": {
     *         "writeConcern": {
     *           "w": 2,
     *           "wtimeout": 0,
     *           "provenance": "clientSupplied"
     *         }
     *       }
     *     }
     *   },
     *   "mode": { "times": 1 }
     * }
     * ```
     *
     * Then, perform an insert operation and assert that a WriteConcernError occurs and that
     * its details property is both accessible and matches the errInfo object from the failpoint.
     */
    metadata: { requires: { mongodb: '>=4.0.0' } },
    async test() {
      throw new Error('This test is not implemented!');
    }
  }).skipReason = 'TODO(NODE-3888): Implement this test';

  describe('2. WriteError.details exposes writeErrors[].errInfo', () => {
    /**
     * Test that writeErrors[].errInfo in a command response is propagated as WriteError.details (or equivalent) in the driver.
     * Using a 5.0+ server, create a collection with document validation like so:
     * @example
     * ```js
     * {
     *   "create": "test",
     *   "validator": {
     *     "x": { $type: "string" }
     *   }
     * }
     *```
     * Enable command monitoring to observe CommandSucceededEvents.
     * Then, insert an invalid document (e.g. `{x: 1}`)
     * and assert that a WriteError occurs, that its code is 121 (i.e. DocumentValidationFailure),
     * and that its details property is accessible.
     * Additionally, assert that a CommandSucceededEvent was observed
     * and that the writeErrors[0].errInfo field in the response document matches the WriteError's details property.
     */

    let collection;

    beforeEach(async () => {
      try {
        await client.db().collection('wc_details').drop();
      } catch {
        // don't care
      }

      collection = await client
        .db()
        .createCollection('wc_details', { validator: { x: { $type: 'string' } } });
    });

    it('test case: insert MongoServerError', {
      metadata: { requires: { mongodb: '>=5.0.0' } },
      async test() {
        const evCapture = once(client, 'commandSucceeded');

        let errInfoFromError;
        try {
          await collection.insertOne({ x: /not a string/ });
          expect.fail('The insert should fail the validation that x must be a string');
        } catch (error) {
          expect(error).to.be.instanceOf(MongoServerError);
          expect(error).to.have.property('code', 121);
          expect(error).to.have.property('errInfo').that.is.an('object');
          errInfoFromError = error.errInfo;
        }

        const commandSucceededEvents = await evCapture;
        expect(commandSucceededEvents).to.have.lengthOf(1);
        const ev = commandSucceededEvents[0];
        expect(ev).to.have.nested.property('reply.writeErrors[0].errInfo').that.is.an('object');

        const errInfoFromEvent = ev.reply.writeErrors[0].errInfo;
        expect(errInfoFromError).to.deep.equal(errInfoFromEvent);
      }
    });

    it('test case: insertMany MongoBulkWriteError', {
      metadata: { requires: { mongodb: '>=5.0.0' } },
      async test() {
        const evCapture = once(client, 'commandSucceeded');

        let errInfoFromError;
        try {
          await collection.insertMany([{ x: /not a string/ }]);
          expect.fail('The insert should fail the validation that x must be a string');
        } catch (error) {
          expect(error).to.be.instanceOf(MongoBulkWriteError);
          expect(error).to.have.property('code', 121);
          expect(error).to.have.property('writeErrors').that.is.an('array');
          expect(error.writeErrors[0]).to.have.property('errInfo').that.is.an('object');
          errInfoFromError = error.writeErrors[0].errInfo;
        }

        const commandSucceededEvents = await evCapture;
        expect(commandSucceededEvents).to.have.lengthOf(1);
        const ev = commandSucceededEvents[0];
        expect(ev).to.have.nested.property('reply.writeErrors[0].errInfo').that.is.an('object');

        const errInfoFromEvent = ev.reply.writeErrors[0].errInfo;
        expect(errInfoFromError).to.deep.equal(errInfoFromEvent);
      }
    });
  });

  describe('3. MongoClient.bulkWrite batch splits a writeModels input with greater than maxWriteBatchSize operations', function () {
    // Test that MongoClient.bulkWrite properly handles writeModels inputs containing a number of writes greater than
    // maxWriteBatchSize.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe CommandStartedEvents.
    // Perform a hello command using client and record the maxWriteBatchSize value contained in the response. Then,
    // construct the following write model (referred to as model):
    // InsertOne: {
    //   "namespace": "db.coll",
    //   "document": { "a": "b" }
    // }
    // Construct a list of write models (referred to as models) with model repeated maxWriteBatchSize + 1 times. Execute
    // bulkWrite on client with models. Assert that the bulk write succeeds and returns a BulkWriteResult with an
    // insertedCount value of maxWriteBatchSize + 1.
    // Assert that two CommandStartedEvents (referred to as firstEvent and secondEvent) were observed for the bulkWrite
    // command. Assert that the length of firstEvent.command.ops is maxWriteBatchSize. Assert that the length of
    // secondEvent.command.ops is 1. If the driver exposes operationIds in its CommandStartedEvents, assert that
    // firstEvent.operationId is equal to secondEvent.operationId.
    let client: MongoClient;
    let maxWriteBatchSize;
    let models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxWriteBatchSize = hello.maxWriteBatchSize;

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;

      models = Array.from({ length: maxWriteBatchSize + 1 }, () => {
        return {
          namespace: 'db.coll',
          name: 'insertOne',
          document: { a: 'b' }
        };
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('splits the commands into 2 operations', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const result = await client.bulkWrite(models);
        expect(result.insertedCount).to.equal(maxWriteBatchSize + 1);
        expect(commands.length).to.equal(2);
        expect(commands[0].command.ops.length).to.equal(maxWriteBatchSize);
        expect(commands[1].command.ops.length).to.equal(1);
      }
    });
  });

  describe('4. MongoClient.bulkWrite batch splits when an ops payload exceeds maxMessageSizeBytes', function () {
    // Test that MongoClient.bulkWrite properly handles a writeModels input which constructs an ops array larger
    // than maxMessageSizeBytes.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe CommandStartedEvents.
    // Perform a hello command using client and record the following values from the response: maxBsonObjectSize
    // and maxMessageSizeBytes. Then, construct the following document (referred to as document):
    // {
    //   "a": "b".repeat(maxBsonObjectSize - 500)
    // }
    // Construct the following write model (referred to as model):
    // InsertOne: {
    //   "namespace": "db.coll",
    //   "document": document
    // }
    // Use the following calculation to determine the number of inserts that should be provided to
    // MongoClient.bulkWrite: maxMessageSizeBytes / maxBsonObjectSize + 1 (referred to as numModels). This number
    // ensures that the inserts provided to MongoClient.bulkWrite will require multiple bulkWrite commands to be
    // sent to the server.
    // Construct as list of write models (referred to as models) with model repeated numModels times. Then execute
    // bulkWrite on client with models. Assert that the bulk write succeeds and returns a BulkWriteResult with
    // an insertedCount value of numModels.
    // Assert that two CommandStartedEvents (referred to as firstEvent and secondEvent) were observed. Assert
    // that the length of firstEvent.command.ops is numModels - 1. Assert that the length of secondEvent.command.ops
    // is 1. If the driver exposes operationIds in its CommandStartedEvents, assert that firstEvent.operationId is
    // equal to secondEvent.operationId.
    let client: MongoClient;
    let maxBsonObjectSize;
    let maxMessageSizeBytes;
    let numModels;
    let models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;
      maxMessageSizeBytes = hello.maxMessageSizeBytes;
      numModels = Math.floor(maxMessageSizeBytes / maxBsonObjectSize + 1);

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;

      models = Array.from({ length: numModels }, () => {
        return {
          name: 'insertOne',
          namespace: 'db.coll',
          document: {
            a: 'b'.repeat(maxBsonObjectSize - 500)
          }
        };
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('splits the commands into 2 operations', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const result = await client.bulkWrite(models);
        expect(result.insertedCount).to.equal(numModels);
        expect(commands.length).to.equal(2);
        expect(commands[0].command.ops.length).to.equal(numModels - 1);
        expect(commands[1].command.ops.length).to.equal(1);
      }
    });
  });

  describe('5. MongoClient.bulkWrite collects WriteConcernErrors across batches', function () {
    // Test that MongoClient.bulkWrite properly collects and reports writeConcernErrors returned in separate batches.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with retryWrites: false configured and command monitoring
    // enabled to observe CommandStartedEvents. Perform a hello command using client and record the maxWriteBatchSize
    // value contained in the response. Then, configure the following fail point with client:
    // {
    //   "configureFailPoint": "failCommand",
    //   "mode": { "times": 2 },
    //   "data": {
    //     "failCommands": ["bulkWrite"],
    //     "writeConcernError": {
    //       "code": 91,
    //       "errmsg": "Replication is being shut down"
    //     }
    //   }
    // }
    // Construct the following write model (referred to as model):
    // InsertOne: {
    //   "namespace": "db.coll",
    //   "document": { "a": "b" }
    // }
    // Construct a list of write models (referred to as models) with model repeated maxWriteBatchSize + 1 times.
    // Execute bulkWrite on client with models. Assert that the bulk write fails and returns a BulkWriteError (referred to as error).
    // Assert that error.writeConcernErrors has a length of 2.
    // Assert that error.partialResult is populated. Assert that error.partialResult.insertedCount is equal to maxWriteBatchSize + 1.
    // Assert that two CommandStartedEvents were observed for the bulkWrite command.
    let client: MongoClient;
    let maxWriteBatchSize;
    let models: ClientBulkWriteModel[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true, retryWrites: false });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      await client.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['bulkWrite'],
          writeConcernError: {
            code: 91,
            errmsg: 'Replication is being shut down'
          }
        }
      });
      maxWriteBatchSize = hello.maxWriteBatchSize;

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;

      models = Array.from({ length: maxWriteBatchSize + 1 }, () => {
        return {
          namespace: 'db.coll',
          name: 'insertOne',
          document: { a: 'b' }
        };
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('splits the commands into 2 operations and handles the errors', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const error = await client.bulkWrite(models).catch(error => error);
        expect(error).to.be.instanceOf(MongoClientBulkWriteError);
        expect(error.writeConcernErrors.length).to.equal(2);
        expect(error.partialResult.insertedCount).to.equal(maxWriteBatchSize + 1);
        expect(commands.length).to.equal(2);
      }
    });
  });

  describe('6. MongoClient.bulkWrite handles individual WriteErrors across batches', function () {
    // Test that MongoClient.bulkWrite handles individual write errors across batches for ordered and unordered bulk writes.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe CommandStartedEvents.
    // Perform a hello command using client and record the maxWriteBatchSize value contained in the response.
    // Construct a MongoCollection (referred to as collection) with the namespace "db.coll" (referred to as namespace).
    // Drop collection. Then, construct the following document (referred to as document):
    // {
    //   "_id": 1
    // }
    // Insert document into collection.
    // Create the following write model (referred to as model):
    // InsertOne {
    //   "namespace": namespace,
    //   "document": document
    // }
    // Construct a list of write models (referred to as models) with model repeated maxWriteBatchSize + 1 times.
    let client: MongoClient;
    let maxWriteBatchSize;
    let models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true, retryWrites: false });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      await client.db('db').collection<{ _id?: number }>('coll').insertOne({ _id: 1 });
      maxWriteBatchSize = hello.maxWriteBatchSize;

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;

      models = Array.from({ length: maxWriteBatchSize + 1 }, () => {
        return {
          namespace: 'db.coll',
          name: 'insertOne',
          document: { _id: 1 }
        };
      });
    });

    afterEach(async function () {
      await client.close();
    });

    context('when the bulk write is unordered', function () {
      // Unordered
      // Test that an unordered bulk write collects WriteErrors across batches.
      // Execute bulkWrite on client with models and ordered set to false. Assert that the bulk write fails
      // and returns a BulkWriteError (referred to as unorderedError).
      // Assert that unorderedError.writeErrors has a length of maxWriteBatchSize + 1.
      // Assert that two CommandStartedEvents were observed for the bulkWrite command.
      it('splits the commands into 2 operations and handles the errors', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const error = await client.bulkWrite(models, { ordered: false }).catch(error => error);
          expect(error).to.be.instanceOf(MongoClientBulkWriteError);
          expect(error.writeErrors.size).to.equal(maxWriteBatchSize + 1);
          expect(commands.length).to.equal(2);
        }
      });
    });

    context('when the bulk write is ordered', function () {
      // Ordered
      // Test that an ordered bulk write does not execute further batches when a WriteError occurs.
      // Execute bulkWrite on client with models and ordered set to true. Assert that the bulk write fails
      // and returns a BulkWriteError (referred to as orderedError).
      // Assert that orderedError.writeErrors has a length of 1.
      // Assert that one CommandStartedEvent was observed for the bulkWrite command.
      it('splits the commands into 2 operations and halts on first error', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const error = await client.bulkWrite(models, { ordered: true }).catch(error => error);
          expect(error).to.be.instanceOf(MongoClientBulkWriteError);
          expect(error.writeErrors.size).to.equal(1);
          expect(commands.length).to.equal(1);
        }
      });
    });
  });

  describe('7. MongoClient.bulkWrite handles a cursor requiring a getMore', function () {
    // Test that MongoClient.bulkWrite properly iterates the results cursor when getMore is required.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe
    // CommandStartedEvents. Perform a hello command using client and record the maxBsonObjectSize value from the response.
    // Construct a MongoCollection (referred to as collection) with the namespace "db.coll" (referred to as namespace).
    // Drop collection. Then create the following list of write models (referred to as models):
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // Execute bulkWrite on client with models and verboseResults set to true. Assert that the bulk write succeeds and returns a BulkWriteResult (referred to as result).
    // Assert that result.upsertedCount is equal to 2.
    // Assert that the length of result.updateResults is equal to 2.
    // Assert that a CommandStartedEvent was observed for the getMore command.
    let client: MongoClient;
    let maxBsonObjectSize;
    const models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;

      client.on('commandStarted', filterForCommands('getMore', commands));
      commands.length = 0;

      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'a'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });
      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'b'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('handles a getMore on the results', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const result = await client.bulkWrite(models, { verboseResults: true });
        expect(result.upsertedCount).to.equal(2);
        expect(result.updateResults.size).to.equal(2);
        expect(commands.length).to.equal(1);
      }
    });
  });

  describe('8. MongoClient.bulkWrite handles a cursor requiring getMore within a transaction', function () {
    // Test that MongoClient.bulkWrite executed within a transaction properly iterates the results
    //  cursor when getMore is required.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // This test must not be run against standalone servers.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe
    // CommandStartedEvents. Perform a hello command using client and record the maxBsonObjectSize value from the response.
    // Construct a MongoCollection (referred to as collection) with the namespace "db.coll" (referred to as namespace). Drop collection.
    // Start a session on client (referred to as session). Start a transaction on session.
    // Create the following list of write models (referred to as models):
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // Execute bulkWrite on client with models, session, and verboseResults set to true. Assert that the bulk
    // write succeeds and returns a BulkWriteResult (referred to as result).
    // Assert that result.upsertedCount is equal to 2.
    // Assert that the length of result.updateResults is equal to 2.
    // Assert that a CommandStartedEvent was observed for the getMore command.
    let client: MongoClient;
    let session: ClientSession;
    let maxBsonObjectSize;
    const models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;

      client.on('commandStarted', filterForCommands('getMore', commands));
      commands.length = 0;

      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'a'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });
      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'b'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });

      session = client.startSession();
      session.startTransaction();
    });

    afterEach(async function () {
      await session.endSession();
      await client.close();
    });

    it('handles a getMore on the results in a transaction', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid', topology: '!single' } },
      async test() {
        const result = await client.bulkWrite(models, { verboseResults: true, session });
        expect(result.upsertedCount).to.equal(2);
        expect(result.updateResults.size).to.equal(2);
        expect(commands.length).to.equal(1);
      }
    });
  });

  describe('9. MongoClient.bulkWrite handles a getMore error', function () {
    // Test that MongoClient.bulkWrite properly handles a failure that occurs when attempting a getMore.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe CommandStartedEvents.
    // Perform a hello command using client and record the maxBsonObjectSize value from the response. Then,
    // configure the following fail point with client:
    // {
    //   "configureFailPoint": "failCommand",
    //   "mode": { "times": 1 },
    //   "data": {
    //     "failCommands": ["getMore"],
    //     "errorCode": 8
    //   }
    // }
    // Construct a MongoCollection (referred to as collection) with the namespace "db.coll" (referred to as namespace).
    // Drop collection. Then create the following list of write models (referred to as models):
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "a".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // UpdateOne {
    //   "namespace": namespace,
    //   "filter": { "_id": "b".repeat(maxBsonObjectSize / 2) },
    //   "update": { "$set": { "x": 1 } },
    //   "upsert": true
    // },
    // Execute bulkWrite on client with models and verboseResults set to true. Assert that the bulk write
    // fails and returns a BulkWriteError (referred to as bulkWriteError).
    // Assert that bulkWriteError.error is populated with an error (referred to as topLevelError). Assert
    // that topLevelError.errorCode is equal to 8.
    // Assert that bulkWriteError.partialResult is populated with a result (referred to as partialResult).
    // Assert that partialResult.upsertedCount is equal to 2. Assert that the length of
    // partialResult.updateResults is equal to 1.
    // Assert that a CommandStartedEvent was observed for the getMore command.
    // Assert that a CommandStartedEvent was observed for the killCursors command.
    let client: MongoClient;
    let maxBsonObjectSize;
    const models: ClientBulkWriteModel<Document>[] = [];
    const getMoreCommands: CommandStartedEvent[] = [];
    const killCursorsCommands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;

      await client.db('admin').command({
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['getMore'],
          errorCode: 8
        }
      });

      client.on('commandStarted', filterForCommands('getMore', getMoreCommands));
      client.on('commandStarted', filterForCommands('killCursors', killCursorsCommands));
      getMoreCommands.length = 0;
      killCursorsCommands.length = 0;

      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'a'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });
      models.push({
        name: 'updateOne',
        namespace: 'db.coll',
        filter: { _id: 'b'.repeat(maxBsonObjectSize / 2) },
        update: { $set: { x: 1 } },
        upsert: true
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('handles a getMore that errors', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const error = await client
          .bulkWrite(models, { verboseResults: true })
          .catch(error => error);
        expect(error).to.be.instanceOf(MongoClientBulkWriteError);
        expect(error.cause.code).to.equal(8);
        expect(error.partialResult).to.exist;
        // TODO: Need to handle batches in cursor one at a time and not call toArray()
        expect(error.partialResult.upsertedCount).to.equal(2);
        expect(error.partialResult.updateResults.size).to.equal(1);
        expect(getMoreCommands.length).to.equal(1);
        expect(killCursorsCommands.length).to.equal(1);
      }
    });
  });

  describe('10. MongoClient.bulkWrite returns error for unacknowledged too-large insert', function () {
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client).
    // Perform a hello command using client and record the following values from the response: maxBsonObjectSize.
    // Then, construct the following document (referred to as document):
    // {
    //   "a": "b".repeat(maxBsonObjectSize)
    // }
    let client: MongoClient;
    let maxBsonObjectSize;
    let document: Document;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;

      document = {
        a: 'b'.repeat(maxBsonObjectSize)
      };
    });

    afterEach(async function () {
      await client.close();
    });

    context('when performing inserts', function () {
      // With insert
      // Construct the following write model (referred to as model):
      // InsertOne: {
      //   "namespace": "db.coll",
      //   "document": document
      // }
      // Construct as list of write models (referred to as models) with the one model.
      // Call MongoClient.bulkWrite with models and BulkWriteOptions.writeConcern set to an unacknowledged write concern.
      // Expect a client-side error due the size.
      it('throws an error', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const error = await client
            .bulkWrite([{ name: 'insertOne', namespace: 'db.coll', document: document }], {
              writeConcern: { w: 0 },
              ordered: false
            })
            .catch(error => error);
          expect(error.message).to.include('Client bulk write operation ops of length');
        }
      });
    });

    context('when performing replacements', function () {
      // With replace
      // Construct the following write model (referred to as model):
      // ReplaceOne: {
      //   "namespace": "db.coll",
      //   "filter": {},
      //   "replacement": document
      // }
      // Construct as list of write models (referred to as models) with the one model.
      // Call MongoClient.bulkWrite with models and BulkWriteOptions.writeConcern set to an unacknowledged write concern.
      // Expect a client-side error due the size.
      it('throws an error', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const error = await client
            .bulkWrite(
              [{ name: 'replaceOne', namespace: 'db.coll', filter: {}, replacement: document }],
              { writeConcern: { w: 0 }, ordered: false }
            )
            .catch(error => error);
          expect(error.message).to.include('Client bulk write operation ops of length');
        }
      });
    });
  });

  describe('11. MongoClient.bulkWrite batch splits when the addition of a new namespace exceeds the maximum message size', function () {
    // Test that MongoClient.bulkWrite batch splits a bulk write when the addition of a new namespace to nsInfo causes the size
    // of the message to exceed maxMessageSizeBytes - 1000.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Repeat the following setup for each test case:
    // Setup
    // Construct a MongoClient (referred to as client) with command monitoring enabled to observe CommandStartedEvents. Perform
    // a hello command using client and record the following values from the response: maxBsonObjectSize and maxMessageSizeBytes.
    // Calculate the following values:
    // opsBytes = maxMessageSizeBytes - 1122
    // numModels = opsBytes / maxBsonObjectSize
    // remainderBytes = opsBytes % maxBsonObjectSize
    // Construct the following write model (referred to as firstModel):
    // InsertOne {
    //   "namespace": "db.coll",
    //   "document": { "a": "b".repeat(maxBsonObjectSize - 57) }
    // }
    // Create a list of write models (referred to as models) with firstModel repeated numModels times.
    // If remainderBytes is greater than or equal to 217, add 1 to numModels and append the following write model to models:
    // InsertOne {
    //   "namespace": "db.coll",
    //   "document": { "a": "b".repeat(remainderBytes - 57) }
    // }
    // Then perform the following two tests:
    let client: MongoClient;
    let maxBsonObjectSize;
    let maxMessageSizeBytes;
    let opsBytes;
    let numModels;
    let remainderBytes;
    let models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;
      maxMessageSizeBytes = hello.maxMessageSizeBytes;
      opsBytes = maxMessageSizeBytes - 1122;
      numModels = Math.floor(opsBytes / maxBsonObjectSize);
      remainderBytes = opsBytes % maxBsonObjectSize;

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;
      models = [];

      models = Array.from({ length: numModels }, () => {
        return {
          namespace: 'db.coll',
          name: 'insertOne',
          document: { a: 'b'.repeat(maxBsonObjectSize - 57) }
        };
      });

      if (remainderBytes >= 217) {
        numModels++;
        models.push({
          namespace: 'db.coll',
          name: 'insertOne',
          document: { a: 'b'.repeat(remainderBytes - 57) }
        });
      }
    });

    afterEach(async function () {
      await client.close();
    });

    context('when no batch splitting is required', function () {
      // Case 1: No batch-splitting required
      // Create the following write model (referred to as sameNamespaceModel):
      // InsertOne {
      //   "namespace": "db.coll",
      //   "document": { "a": "b" }
      // }
      // Append sameNamespaceModel to models.
      // Execute bulkWrite on client with models. Assert that the bulk write succeeds and returns a BulkWriteResult (referred to as result).
      // Assert that result.insertedCount is equal to numModels + 1.
      // Assert that one CommandStartedEvent was observed for the bulkWrite command (referred to as event).
      // Assert that the length of event.command.ops is numModels + 1. Assert that the length of event.command.nsInfo is 1.
      // Assert that the namespace contained in event.command.nsInfo is "db.coll".
      it('executes in a single batch', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const sameNamespaceModel: ClientBulkWriteModel<Document> = {
            name: 'insertOne',
            namespace: 'db.coll',
            document: { a: 'b' }
          };
          const testModels = models.concat([sameNamespaceModel]);
          const result = await client.bulkWrite(testModels);
          expect(result.insertedCount).to.equal(numModels + 1);
          expect(commands.length).to.equal(1);
          expect(commands[0].command.ops.length).to.equal(numModels + 1);
          expect(commands[0].command.nsInfo.length).to.equal(1);
          expect(commands[0].command.nsInfo[0].ns).to.equal('db.coll');
        }
      });
    });

    context('when batch splitting is required', function () {
      // Case 2: Batch-splitting required
      // Construct the following namespace (referred to as namespace):
      // "db." + "c".repeat(200)
      // Create the following write model (referred to as newNamespaceModel):
      // InsertOne {
      //   "namespace": namespace,
      //   "document": { "a": "b" }
      // }
      // Append newNamespaceModel to models.
      // Execute bulkWrite on client with models. Assert that the bulk write succeeds and returns a BulkWriteResult (referred to as result).
      // Assert that result.insertedCount is equal to numModels + 1.
      // Assert that two CommandStartedEvents were observed for the bulkWrite command (referred to as firstEvent and secondEvent).
      // Assert that the length of firstEvent.command.ops is equal to numModels. Assert that the length of firstEvent.command.nsInfo
      // is equal to 1. Assert that the namespace contained in firstEvent.command.nsInfo is "db.coll".
      // Assert that the length of secondEvent.command.ops is equal to 1. Assert that the length of secondEvent.command.nsInfo
      // is equal to 1. Assert that the namespace contained in secondEvent.command.nsInfo is namespace.
      it('executes in multiple batches', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const namespace = `db.${'c'.repeat(200)}`;
          const newNamespaceModel: ClientBulkWriteModel<Document> = {
            name: 'insertOne',
            namespace: namespace,
            document: { a: 'b' }
          };
          const testModels = models.concat([newNamespaceModel]);
          const result = await client.bulkWrite(testModels);
          expect(result.insertedCount).to.equal(numModels + 1);
          expect(commands.length).to.equal(2);
          expect(commands[0].command.ops.length).to.equal(numModels);
          expect(commands[0].command.nsInfo.length).to.equal(1);
          expect(commands[0].command.nsInfo[0].ns).to.equal('db.coll');
          expect(commands[1].command.ops.length).to.equal(1);
          expect(commands[1].command.nsInfo.length).to.equal(1);
          expect(commands[1].command.nsInfo[0].ns).to.equal(namespace);
        }
      });
    });
  });

  describe('12. MongoClient.bulkWrite returns an error if no operations can be added to ops', function () {
    // Test that MongoClient.bulkWrite returns an error if an operation provided exceeds maxMessageSizeBytes
    // such that an empty ops payload would be sent.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // This test may be skipped by drivers that are not able to construct arbitrarily large documents.
    // Construct a MongoClient (referred to as client). Perform a hello command using client and record
    // the maxMessageSizeBytes value contained in the response.
    let client: MongoClient;
    let maxMessageSizeBytes;

    beforeEach(async function () {
      client = this.configuration.newClient({});
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxMessageSizeBytes = hello.maxMessageSizeBytes;
    });

    afterEach(async function () {
      await client.close();
    });

    context('when the document is too large', function () {
      // Case 1: document too large
      // Construct the following write model (referred to as largeDocumentModel):
      // InsertOne {
      //   "namespace": "db.coll",
      //   "document": { "a": "b".repeat(maxMessageSizeBytes) }
      // }
      // Execute bulkWrite on client with largeDocumentModel. Assert that an error (referred to as error) is returned.
      // Assert that error is a client error.
      it('raises a client error', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const model: ClientBulkWriteModel<Document> = {
            name: 'insertOne',
            namespace: 'db.coll',
            document: { a: 'b'.repeat(maxMessageSizeBytes) }
          };
          const error = await client.bulkWrite([model]).catch(error => error);
          expect(error).to.be.instanceOf(MongoInvalidArgumentError);
        }
      });
    });

    context('when the namespace is too large', function () {
      // Case 2: namespace too large
      // Construct the following namespace (referred to as namespace):
      // "db." + "c".repeat(maxMessageSizeBytes)
      // Construct the following write model (referred to as largeNamespaceModel):
      // InsertOne {
      //   "namespace": namespace,
      //   "document": { "a": "b" }
      // }
      // Execute bulkWrite on client with largeNamespaceModel. Assert that an error (referred to as error) is returned.
      // Assert that error is a client error.
      it('raises a client error', {
        metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
        async test() {
          const namespace = `db.${'c'.repeat(maxMessageSizeBytes)}`;
          const model: ClientBulkWriteModel<Document> = {
            name: 'insertOne',
            namespace: namespace,
            document: { a: 'b' }
          };
          const error = await client.bulkWrite([model]).catch(error => error);
          expect(error).to.be.instanceOf(MongoInvalidArgumentError);
        }
      });
    });
  });

  describe('13. MongoClient.bulkWrite returns an error if auto-encryption is configured', function () {
    // This test is expected to be removed when DRIVERS-2888 is resolved.
    // Test that MongoClient.bulkWrite returns an error if the client has auto-encryption configured.
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // Construct a MongoClient (referred to as client) configured with the following AutoEncryptionOpts:
    // AutoEncryptionOpts {
    //   "keyVaultNamespace": "db.coll",
    //   "kmsProviders": {
    //     "aws": {
    //       "accessKeyId": "foo",
    //       "secretAccessKey": "bar"
    //     }
    //   }
    // }
    // Construct the following write model (referred to as model):
    // InsertOne {
    //   "namespace": "db.coll",
    //   "document": { "a": "b" }
    // }
    // Execute bulkWrite on client with model. Assert that an error (referred to as error) is returned.
    // Assert that error is a client error containing the message: "bulkWrite does not currently support automatic encryption".
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient(
        {},
        {
          autoEncryption: {
            keyVaultNamespace: 'db.coll',
            kmsProviders: {
              aws: {
                accessKeyId: 'foo',
                secretAccessKey: 'bar'
              }
            },
            extraOptions: getEncryptExtraOptions()
          }
        }
      );
    });

    afterEach(async function () {
      await client.close();
    });

    it('raises a client side error', async function () {
      const model: ClientBulkWriteModel<Document> = {
        name: 'insertOne',
        namespace: 'db.coll',
        document: { a: 'b' }
      };
      const error = await client.bulkWrite([model]).catch(error => error);
      expect(error.message).to.include('bulkWrite does not currently support automatic encryption');
    });
  });

  describe('14. `explain` helpers allow users to specify `maxTimeMS`', function () {
    let client: MongoClient;
    const commands: CommandStartedEvent[] = [];
    let collection: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();

      await client.db('explain-test').dropDatabase();
      collection = await client.db('explain-test').createCollection('collection');

      client.on('commandStarted', filterForCommands('explain', commands));
      commands.length = 0;
    });

    afterEach(async function () {
      await client.close();
    });

    it('sets maxTimeMS on explain commands, when specified', async function () {
      await collection
        .find(
          { name: 'john doe' },
          {
            explain: {
              maxTimeMS: 2000,
              verbosity: 'queryPlanner'
            }
          }
        )
        .toArray();

      const [{ command }] = commands;
      expect(command).to.have.property('maxTimeMS', 2000);
    });
  });

  describe('15. `MongoClient.bulkWrite` with unacknowledged write concern uses `w:0` for all batches', function () {
    // This test must only be run on 8.0+ servers. This test must be skipped on Atlas Serverless.
    // If testing with a sharded cluster, only connect to one mongos. This is intended to ensure the `countDocuments` operation
    // uses the same connection as the `bulkWrite` to get the correct connection count. (See
    // [DRIVERS-2921](https://jira.mongodb.org/browse/DRIVERS-2921)).
    // Construct a `MongoClient` (referred to as `client`) with
    // [command monitoring](../../command-logging-and-monitoring/command-logging-and-monitoring.md) enabled to observe
    // CommandStartedEvents. Perform a `hello` command using `client` and record the `maxBsonObjectSize` and
    // `maxMessageSizeBytes` values in the response.
    // Construct a `MongoCollection` (referred to as `coll`) for the collection "db.coll". Drop `coll`.
    // Use the `create` command to create "db.coll" to workaround [SERVER-95537](https://jira.mongodb.org/browse/SERVER-95537).
    // Construct the following write model (referred to as `model`):
    // InsertOne: {
    //   "namespace": "db.coll",
    //   "document": { "a": "b".repeat(maxBsonObjectSize - 500) }
    // }
    // Construct a list of write models (referred to as `models`) with `model` repeated
    // `maxMessageSizeBytes / maxBsonObjectSize + 1` times.
    // Call `client.bulkWrite` with `models`. Pass `BulkWriteOptions` with `ordered` set to `false` and `writeConcern` set to
    // an unacknowledged write concern. Assert no error occurred. Assert the result indicates the write was unacknowledged.
    // Assert that two CommandStartedEvents (referred to as `firstEvent` and `secondEvent`) were observed for the `bulkWrite`
    // command. Assert that the length of `firstEvent.command.ops` is `maxMessageSizeBytes / maxBsonObjectSize`. Assert that
    // the length of `secondEvent.command.ops` is 1. If the driver exposes `operationId`s in its CommandStartedEvents, assert
    // that `firstEvent.operationId` is equal to `secondEvent.operationId`. Assert both commands include
    // `writeConcern: {w: 0}`.
    // To force completion of the `w:0` writes, execute `coll.countDocuments` and expect the returned count is
    // `maxMessageSizeBytes / maxBsonObjectSize + 1`. This is intended to avoid incomplete writes interfering with other tests
    // that may use this collection.
    let client: MongoClient;
    let maxBsonObjectSize;
    let maxMessageSizeBytes;
    let numModels;
    let models: ClientBulkWriteModel<Document>[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      const uri = this.configuration.url({
        useMultipleMongoses: false
      });
      client = this.configuration.newClient(uri, { monitorCommands: true });
      await client.connect();
      await client
        .db('db')
        .collection('coll')
        .drop()
        .catch(() => null);
      await client.db('db').createCollection('coll');
      const hello = await client.db('admin').command({ hello: 1 });
      maxBsonObjectSize = hello.maxBsonObjectSize;
      maxMessageSizeBytes = hello.maxMessageSizeBytes;
      numModels = Math.floor(maxMessageSizeBytes / maxBsonObjectSize) + 1;
      models = Array.from({ length: numModels }, () => {
        return {
          name: 'insertOne',
          namespace: 'db.coll',
          document: {
            a: 'b'.repeat(maxBsonObjectSize - 500)
          }
        };
      });

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;
    });

    afterEach(async function () {
      await client.close();
    });

    it('performs all writes unacknowledged', {
      metadata: { requires: { mongodb: '>=8.0.0', serverless: 'forbid' } },
      async test() {
        const result = await client.bulkWrite(models, { ordered: false, writeConcern: { w: 0 } });
        expect(result.acknowledged).to.be.false;
        expect(commands.length).to.equal(2);
        expect(commands[0].command.ops.length).to.equal(numModels - 1);
        expect(commands[0].command.writeConcern.w).to.equal(0);
        expect(commands[1].command.ops.length).to.equal(1);
        expect(commands[1].command.writeConcern.w).to.equal(0);
        const count = await client.db('db').collection('coll').countDocuments();
        expect(count).to.equal(numModels);
      }
    });
  });
});
