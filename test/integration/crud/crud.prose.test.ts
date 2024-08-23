import { expect } from 'chai';
import { once } from 'events';

import { type CommandStartedEvent } from '../../../mongodb';
import { MongoBulkWriteError, type MongoClient, MongoServerError } from '../../mongodb';
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

  describe('14. `explain` helpers allow users to specify `maxTimeMS`', function () {
    let client: MongoClient;
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();

      client.on('commandStarted', filterForCommands('explain', commands));
      commands.length = 0;
    });

    afterEach(async function () {
      await client.close();
    });

    it('sets maxTimeMS on explain commands, when specfied', async function () {
      // Create a collection, referred to as `collection`, with the namespace `explain-test.collection`.
      const collection = client.db('explain-test').collection('collection');

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
