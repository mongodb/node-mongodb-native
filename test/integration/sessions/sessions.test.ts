import { expect } from 'chai';

import {
  type CommandStartedEvent,
  type CommandSucceededEvent,
  LEGACY_HELLO_COMMAND,
  type MongoClient,
  MongoServerError
} from '../../mongodb';
import type { TestConfiguration } from '../../tools/runner/config';
import { setupDatabase } from '../shared';

const ignoredCommands = [LEGACY_HELLO_COMMAND];
const test: {
  client: MongoClient;
  commands: { started: CommandStartedEvent[]; succeeded: CommandSucceededEvent[] };
  setup: (config: TestConfiguration) => Promise<void>;
} = {
  client: null,
  commands: { started: [], succeeded: [] },
  async setup(config) {
    this.commands = { started: [], succeeded: [] };
    this.client = config.newClient({ w: 1 }, { maxPoolSize: 1, monitorCommands: true });

    this.client.on('commandStarted', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        this.commands.started.push(event);
      }
    });

    this.client.on('commandSucceeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        this.commands.succeeded.push(event);
      }
    });

    await this.client.connect();
  }
};

describe('Sessions Spec', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async function () {
    await client.close();
  });

  describe('Sessions - functional - old format', function () {
    before(function () {
      return setupDatabase(this.configuration);
    });

    describe('endSessions', function () {
      beforeEach(async function () {
        await test.setup(this.configuration);
      });

      it('should send endSessions for multiple sessions', async function () {
        const client = test.client;
        const sessions = [client.startSession(), client.startSession()].map(s => s.id);

        await client.close();

        expect(test.commands.started).to.have.length(1);
        expect(test.commands.started[0].commandName).to.equal('endSessions');
        expect(test.commands.started[0].command.endSessions).to.include.deep.members(sessions);
        expect(client.s.activeSessions.size).to.equal(0);
      });
    });

    describe('withSession', function () {
      let client: MongoClient;

      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
      });

      afterEach(async function () {
        await client?.close();
      });

      const tests = [
        {
          description: 'should resolve non-async callbacks that return promises',
          operation: session => {
            return client.db('test').collection('foo').find({}, { session }).toArray();
          }
        },
        {
          description: 'should resolve async callbacks',
          operation: async session =>
            await client.db('test').collection('foo').find({}, { session }).toArray()
        },
        {
          description: 'should reject with error thrown from async callback',
          operation: async (/* session */) => {
            throw new Error('thrown from async function');
          }
        },
        {
          description: 'should reject callbacks that return a rejected promise',
          operation: (/* session */) => {
            return Promise.reject(new Error('something awful'));
          }
        },
        {
          description: 'should resolve callbacks that do not return a promise',
          operation: (/* session */) => {
            // This is incorrect usage of the API, but we're making sure that we don't use
            // .then on the result of the callback, we should always start with a Promise.resolve()
            //
            // void return;
          }
        },
        {
          description: 'should reject callbacks that throw synchronous exceptions',
          operation: (/* session */) => {
            throw new Error('something went wrong!');
          }
        }
      ];

      for (const testCase of tests) {
        it(testCase.description, async function () {
          const shouldResolve = testCase.description.startsWith('should resolve');
          const shouldReject = testCase.description.startsWith('should reject');

          expect(shouldResolve || shouldReject, 'Check your test description').to.be.true;

          let sessionWasEnded = false;

          return (
            client
              // @ts-expect-error: some operations return void to test it is handled
              .withSession(session => {
                session.on('ended', () => {
                  sessionWasEnded = true;
                });
                return testCase.operation(session);
              })
              .then(
                () => {
                  if (shouldReject) {
                    expect.fail('this should have rejected');
                  }
                  expect(client.s.sessionPool.sessions).to.have.length(1);
                },
                () => {
                  if (shouldResolve) {
                    expect.fail('this should have resolved');
                  }
                  expect(client.s.sessionPool.sessions).to.have.length(1);
                }
              )
              .then(() => {
                // verify that the `endSessions` command was sent
                expect(sessionWasEnded).to.be.true;
              })
          );
        });
      }

      it('supports passing options to ClientSession', async function () {
        let sessionWasEnded = false;

        await client.withSession({ causalConsistency: false }, async session => {
          session.on('ended', () => {
            sessionWasEnded = true;
          });
          expect(session.supports.causalConsistency).to.be.false;
          await client.db('test').collection('foo').find({}, { session }).toArray();
        });

        expect(client.s.sessionPool.sessions).to.have.length(1);
        expect(sessionWasEnded).to.be.true;
      });

      it('resolves with the value the callback returns', async () => {
        const result = await client.withSession(async session => {
          return client.db('test').collection('foo').find({}, { session }).toArray();
        });
        expect(result).to.be.an('array');
      });
    });

    context('unacknowledged writes', () => {
      it('should not include session for unacknowledged writes', async function () {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'insert') {
            events.push(event);
          }
        });
        await client
          .db('test')
          .collection('foo')
          .insertOne({ foo: 'bar' }, { writeConcern: { w: 0 } });
        const event = events[0];
        expect(event).nested.property('command.writeConcern.w').to.equal(0);
        expect(event).to.not.have.nested.property('command.lsid');
      });
      it('should throw error with explicit session', {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
        test: async function () {
          const events = [];
          client.on('commandStarted', event => {
            if (event.commandName === 'insert') {
              events.push(event);
            }
          });

          const session = client.startSession({ causalConsistency: true });

          const error = await client
            .db('test')
            .collection('foo')
            .insertOne({ foo: 'bar' }, { writeConcern: { w: 0 }, session })
            .catch(error => error);

          expect(error.message).to.equal('Cannot have explicit session with unacknowledged writes');

          await session.endSession();
        }
      });
    });
  });

  describe('Sessions - functional - new format', function () {
    let client;
    let collection;

    beforeEach(async function () {
      const config = this.configuration;
      client = config.newClient();
      await client.connect();

      try {
        await client
          .db('sessions_functional_test_db')
          .collection('sessions_functional_test')
          .drop();
      } catch (_) {
        // do not care
      }

      collection = await client
        .db('sessions_functional_test_db')
        .createCollection('sessions_functional_test');

      await collection.deleteMany({});
    });

    afterEach(async () => {
      if (client) await client.close();
    });

    describe('advanceClusterTime()', () => {
      let controlSession;
      let testSession;
      let otherSession;

      beforeEach(async () => {
        testSession = client.startSession();
        otherSession = client.startSession();
        controlSession = client.startSession();

        // set up sessions with two sets of cluster times
        expect(await collection.findOne({}, { session: controlSession })).to.be.null;
        expect(await collection.findOne({}, { session: testSession })).to.be.null;
        await collection.insertOne({ apple: 'green' });
        expect(await collection.findOne({}, { session: otherSession }))
          .property('apple')
          .to.equal('green');
        expect(testSession.clusterTime).not.deep.equal(otherSession.clusterTime);
        expect(controlSession.clusterTime).not.deep.equal(otherSession.clusterTime);
        // it's ok for the control session to have the same starting clusterTime as testSession
        // since the testSession is the one that will be updated
      });

      afterEach(async () => {
        await Promise.all([
          controlSession.endSession(),
          testSession.endSession(),
          otherSession.endSession()
        ]);
      });

      it(
        'should result in a usable session when called with a valid cluster time and should not affect any other sessions',
        {
          metadata: { requires: { mongodb: '>= 3.6.0', topology: ['replicaset'] } },
          async test() {
            // advance cluster time to a new valid value
            testSession.advanceClusterTime(otherSession.clusterTime);
            expect(testSession.clusterTime).to.deep.equal(otherSession.clusterTime);

            // check control session
            expect(controlSession.clusterTime).to.not.deep.equal(testSession.clusterTime);

            // check that the session still works
            expect(await collection.findOne({}, { session: testSession }))
              .property('apple')
              .to.equal('green');
          }
        }
      );

      it('should not let an invalid cluster time impact existing sessions', {
        metadata: { requires: { mongodb: '>= 3.6.0', topology: ['replicaset'] } },
        async test() {
          // note, because of our validation, we can't use advanceClusterTime to set an invalid clusterTime
          // so for testing, we have to set it directly
          testSession.clusterTime = { clusterTime: { greaterThan: () => true } };

          try {
            await collection.findOne({}, { session: testSession });
            expect.fail('expected findOne to fail, but it passed');
          } catch (err) {
            expect(err).to.be.instanceOf(MongoServerError);
          }

          expect(await collection.findOne({}, { session: controlSession }))
            .property('apple')
            .to.equal('green');
        }
      });

      it('should not let an invalid cluster time impact new sessions', {
        metadata: { requires: { mongodb: '>= 3.6.0', topology: ['replicaset'] } },
        async test() {
          // note, because of our validation, we can't use advanceClusterTime to set an invalid clusterTime
          // so for testing, we have to set it directly
          testSession.clusterTime = { clusterTime: { greaterThan: () => true } };

          try {
            await collection.findOne({}, { session: testSession });
            expect.fail('expected findOne to fail, but it passed');
          } catch (err) {
            expect(err).to.be.instanceOf(MongoServerError);
          }

          await otherSession.endSession();
          otherSession = client.startSession();

          expect(await collection.findOne({}, { session: otherSession }))
            .property('apple')
            .to.equal('green');
        }
      });

      it('should not let an invalid cluster time impact other uses of the client', {
        metadata: { requires: { mongodb: '>= 3.6.0', topology: ['replicaset'] } },
        async test() {
          // note, because of our validation, we can't use advanceClusterTime to set an invalid clusterTime
          // so for testing, we have to set it directly
          testSession.clusterTime = { clusterTime: { greaterThan: () => true } };

          try {
            await collection.findOne({}, { session: testSession });
            expect.fail('expected findOne to fail, but it passed');
          } catch (err) {
            expect(err).to.be.instanceOf(MongoServerError);
          }

          expect(await collection.findOne({}))
            .property('apple')
            .to.equal('green');
        }
      });
    });
  });

  describe('Session allocation', () => {
    let utilClient: MongoClient;
    let client: MongoClient;
    let testCollection;

    beforeEach(async function () {
      utilClient = await this.configuration
        .newClient({ maxPoolSize: 1, monitorCommands: true })
        .connect();
      // reset test collection
      testCollection = utilClient.db('test').collection('too.many.sessions');
      await testCollection.drop();
      await utilClient.close();

      // Fresh unused client for the test
      client = await this.configuration.newClient({
        maxPoolSize: 1,
        monitorCommands: true
      });
      await client.connect(); // Parallel connect issue
      testCollection = client.db('test').collection('too.many.sessions');
    });

    afterEach(async () => {
      await client?.close();
      await utilClient?.close();
    });

    it('should only use one session for many operations when maxPoolSize is 1', async () => {
      const documents = Array.from({ length: 50 }).map((_, idx) => ({ _id: idx }));

      const events: CommandStartedEvent[] = [];
      client.on('commandStarted', ev => events.push(ev));
      const allResults = await Promise.all(documents.map(doc => testCollection.insertOne(doc)));

      expect(allResults).to.have.lengthOf(documents.length);
      expect(events).to.have.lengthOf(documents.length);

      expect(new Set(events.map(ev => ev.command.lsid.id.toString('hex'))).size).to.equal(1);
    });
  });
});
