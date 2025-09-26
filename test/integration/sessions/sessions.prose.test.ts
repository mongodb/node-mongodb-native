import { ObjectId } from 'bson';
import { expect } from 'chai';
import { type ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import * as os from 'os';
import * as path from 'path';

import { type CommandStartedEvent } from '../../../src/cmap/command_monitoring_events';
import { type Collection } from '../../../src/collection';
import { MongoDriverError, MongoInvalidArgumentError } from '../../../src/error';
import { MongoClient } from '../../../src/mongo_client';
import { sleep } from '../../tools/utils';

describe('Sessions Prose Tests', () => {
  describe('5. Session argument is for the right client', () => {
    let client1: MongoClient;
    let client2: MongoClient;

    beforeEach(async function () {
      client1 = this.configuration.newClient();
      client2 = this.configuration.newClient();
    });

    afterEach(async function () {
      await client1?.close();
      await client2?.close();
    });

    /**
     * Steps:
     * - Create client1 and client2
     * - Get database from client1
     * - Get collection from database
     * - Start session from client2
     * - Call collection.insertOne(session,...)
     * - Assert that an error was reported because session was not started from client1
     *
     * This validation lives in our executeOperation layer so it applies universally.
     * A find and an insert provide enough coverage, we determined we do not need to enumerate every possible operation.
     */
    context(
      'when session is started from a different client than operation is being run on',
      () => {
        it('insertOne operation throws a MongoInvalidArgumentError', async () => {
          const db = client1.db();
          const collection = db.collection('test');
          const session = client2.startSession();
          const error = await collection.insertOne({}, { session }).catch(error => error);
          expect(error).to.be.instanceOf(MongoInvalidArgumentError);
          expect(error).to.match(/ClientSession must be from the same MongoClient/i);
        });

        it('find operation throws a MongoInvalidArgumentError', async () => {
          const db = client1.db();
          const collection = db.collection('test');
          const session = client2.startSession();
          const error = await collection
            .find({}, { session })
            .toArray()
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoInvalidArgumentError);
          expect(error).to.match(/ClientSession must be from the same MongoClient/i);
        });
      }
    );
  });

  describe('14. Implicit sessions only allocate their server session after a successful connection checkout', () => {
    let client: MongoClient;
    let testCollection: Collection<{ _id: number; a?: number }>;

    beforeEach(async function () {
      const configuration = this.configuration;
      client = await configuration.newClient({ maxPoolSize: 1, monitorCommands: true }).connect();

      // reset test collection
      testCollection = client.db('test').collection('too.many.sessions');
      await testCollection.drop().catch(() => null);
    });

    afterEach(async () => {
      await client?.close(true);
    });

    /**
     * Create a MongoClient with the following options: maxPoolSize=1 and retryWrites=true
     * Attach a command started listener that collects each command's lsid
     * Drivers MUST assert that exactly one session is used for all operations at least once across the retries of this test.
     * Note that it's possible, although rare, for greater than 1 server session to be used because the session is not released until after the connection is checked in.
     * Drivers MUST assert that the number of allocated sessions is strictly less than the number of concurrent operations in every retry of this test. In this instance it would be less than (but NOT equal to) 8.
     */
    it('released server sessions are correctly reused', async () => {
      const events: CommandStartedEvent[] = [];
      client.on('commandStarted', ev => events.push(ev));

      const operations = [
        testCollection.insertOne({ _id: 1 }),
        testCollection.deleteOne({ _id: 2 }),
        testCollection.updateOne({ _id: 3 }, { $set: { a: 1 } }),
        testCollection.bulkWrite([
          { updateOne: { filter: { _id: 4 }, update: { $set: { a: 1 } } } }
        ]),
        testCollection.findOneAndDelete({ _id: 5 }),
        testCollection.findOneAndUpdate({ _id: 6 }, { $set: { a: 1 } }),
        testCollection.findOneAndReplace({ _id: 7 }, { a: 8 }),
        testCollection.find().toArray()
      ];

      const allResults = await Promise.all(operations);

      expect(allResults).to.have.lengthOf(operations.length);
      expect(events).to.have.lengthOf(operations.length);

      // This is a guarantee in node, unless you are performing a transaction (which is not being done in this test)
      expect(new Set(events.map(ev => ev.command.lsid.id.toString('hex')))).to.have.lengthOf(1);
    });
  });

  describe('When sessions are not supported', () => {
    /**
     * Since all regular 3.6+ servers support sessions, the prose tests which test for
     * session non-support SHOULD use a mongocryptd server as the test server
     * (available with server versions 4.2+)
     *
     * As part of the test setup for these cases, create a MongoClient pointed at the test server
     * with the options specified in the test case and verify that the test server does NOT define a
     * value for logicalSessionTimeoutMinutes by sending a hello command and checking the response.
     */
    const mongocryptdTestPort = '27022';
    let client: MongoClient;
    let childProcess: ChildProcess;

    before(() => {
      const pidFile = path.join(os.tmpdir(), new ObjectId().toHexString());
      childProcess = spawn(
        'mongocryptd',
        ['--port', mongocryptdTestPort, '--ipv6', '--pidfilepath', pidFile],
        {
          stdio: 'ignore',
          detached: true
        }
      );

      childProcess.on('error', err => {
        console.warn('Sessions prose mongocryptd error:', err);
      });
    });

    beforeEach(async () => {
      client = new MongoClient(`mongodb://localhost:${mongocryptdTestPort}`, {
        monitorCommands: true
      });

      const hello = await client.db().command({ hello: true });
      expect(hello).to.have.property('iscryptd', true); // sanity check
      expect(hello).to.not.have.property('logicalSessionTimeoutMinutes');
    });

    afterEach(async () => {
      await client?.close();
    });

    after(() => {
      childProcess.kill();
    });

    it(
      '18. Implicit session is ignored if connection does not support sessions',
      {
        requires: {
          clientSideEncryption: true
        }
      },
      async function () {
        /**
         * 1. Send a read command to the server (e.g., `findOne`), ignoring any errors from the server response
         * 2. Check the corresponding `commandStarted` event: verify that `lsid` is not set
         */
        const readCommandEventPromise = once(client, 'commandStarted').then(res => res[0]);
        await client
          .db()
          .collection('test')
          .findOne({})
          .catch(() => null);
        const readCommandEvent = await Promise.race([readCommandEventPromise, sleep(500)]);
        expect(readCommandEvent).to.have.property('commandName', 'find');
        expect(readCommandEvent).to.not.have.property('lsid');

        /**
         * 3. Send a write command to the server (e.g., `insertOne`), ignoring any errors from the server response
         * 4. Check the corresponding `commandStarted` event: verify that `lsid` is not set
         */
        const writeCommandEventPromise = once(client, 'commandStarted').then(res => res[0]);
        await client
          .db()
          .collection('test')
          .insertOne({})
          .catch(() => null);
        const writeCommandEvent = await Promise.race([writeCommandEventPromise, sleep(500)]);
        expect(writeCommandEvent).to.have.property('commandName', 'insert');
        expect(writeCommandEvent).to.not.have.property('lsid');
      }
    );

    it(
      '19. Explicit session raises an error if connection does not support sessions',
      {
        requires: {
          clientSideEncryption: true
        }
      },
      async function () {
        /**
         * 1. Create a new explicit session by calling `startSession` (this MUST NOT error)
         */
        const session = client.startSession();

        /**
         * 2. Attempt to send a read command to the server (e.g., `findOne`) with the explicit session passed in
         * 3. Assert that a client-side error is generated indicating that sessions are not supported
         */
        const readOutcome = await client
          .db()
          .collection('test')
          .findOne({}, { session })
          .catch(err => err);
        expect(readOutcome).to.be.instanceOf(MongoDriverError);
        expect(readOutcome.message).to.match(/does not support sessions/);

        /**
         * 4. Attempt to send a write command to the server (e.g., `insertOne`) with the explicit session passed in
         * 5. Assert that a client-side error is generated indicating that sessions are not supported
         */
        const writeOutcome = await client
          .db()
          .collection('test')
          .insertOne({}, { session })
          .catch(err => err);
        expect(writeOutcome).to.be.instanceOf(MongoDriverError);
        expect(writeOutcome.message).to.match(/does not support sessions/);
      }
    );
  });
});
