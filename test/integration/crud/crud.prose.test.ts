import { expect } from 'chai';
import { once } from 'events';

import { type CommandStartedEvent } from '../../../mongodb';
import {
  type AnyClientBulkWriteModel,
  type Collection,
  MongoBulkWriteError,
  type MongoClient,
  MongoServerError
} from '../../mongodb';
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
    const models: AnyClientBulkWriteModel[] = [];
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      await client.db('db').collection('coll').drop();
      const hello = await client.db('admin').command({ hello: 1 });
      maxWriteBatchSize = hello.maxWriteBatchSize;

      client.on('commandStarted', filterForCommands('bulkWrite', commands));
      commands.length = 0;

      Array.from({ length: maxWriteBatchSize + 1 }, () => {
        models.push({
          namespace: 'db.coll',
          name: 'insertOne',
          document: { a: 'b' }
        });
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
    const models: AnyClientBulkWriteModel[] = [];
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

      Array.from({ length: numModels }, () => {
        models.push({
          name: 'insertOne',
          namespace: 'db.coll',
          document: {
            a: 'b'.repeat(maxBsonObjectSize - 500)
          }
        });
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
});
