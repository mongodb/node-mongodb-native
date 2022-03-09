import { expect } from 'chai';

import type { MongoClient } from '../../../src';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { MongoServerError } from '../../../src/error';
import { setupDatabase, withMonitoredClient } from '../shared';

const ignoredCommands = [LEGACY_HELLO_COMMAND];
let hasInitialPingOccurred = false;
const test = {
  client: null,
  commands: { started: [], succeeded: [] },
  setup: function (config) {
    this.commands = { started: [], succeeded: [] };
    this.client = config.newClient({ w: 1 }, { maxPoolSize: 1, monitorCommands: true });

    // Because we have a MongoClient.connect method, an extra 'ping' event is sent to the
    // server when authentication is enabled.  We have to detect the scenario when auth is
    // enabled for the test and ignore the initial ping.  This will be addressed in NODE-2149.
    const auth = config.options.auth;
    const isAuthEnabled = !!(auth && auth.username && auth.password);
    this.client.on('commandStarted', event => {
      if (event.commandName === 'ping' && isAuthEnabled && !hasInitialPingOccurred) {
        hasInitialPingOccurred = true;
        return;
      }
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        this.commands.started.push(event);
      }
    });

    this.client.on('commandSucceeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        this.commands.succeeded.push(event);
      }
    });

    return this.client.connect();
  }
};

describe('Sessions Spec', function () {
  describe('Sessions - functional - old format', function () {
    before(function () {
      return setupDatabase(this.configuration);
    });

    describe('endSessions', function () {
      beforeEach(function () {
        return test.setup(this.configuration);
      });

      it('should send endSessions for multiple sessions', {
        metadata: {
          requires: { topology: ['single'], mongodb: '>=3.6.0' },
          // Skipping session leak tests b/c these are explicit sessions
          sessions: { skipLeakTests: true }
        },
        test: function (done) {
          const client = test.client;
          const sessions = [client.startSession(), client.startSession()].map(s => s.id);

          client.close(err => {
            expect(err).to.not.exist;
            expect(test.commands.started).to.have.length(1);
            expect(test.commands.started[0].commandName).to.equal('endSessions');
            expect(test.commands.started[0].command.endSessions).to.include.deep.members(sessions);
            expect(client.s.sessions.size).to.equal(0);

            done();
          });
        }
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
                  expect(client.topology.s.sessionPool.sessions).to.have.length(1);
                },
                () => {
                  if (shouldResolve) {
                    expect.fail('this should have resolved');
                  }
                  expect(client.topology.s.sessionPool.sessions).to.have.length(1);
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

        expect(client.topology.s.sessionPool.sessions).to.have.length(1);
        expect(sessionWasEnded).to.be.true;
      });
    });

    context('unacknowledged writes', () => {
      it('should not include session for unacknowledged writes', {
        metadata: { requires: { topology: 'single', mongodb: '>=3.6.0' } },
        test: withMonitoredClient(
          'insert',
          { clientOptions: { writeConcern: { w: 0 } } },
          function (client, events, done) {
            client
              .db('test')
              .collection('foo')
              .insertOne({ foo: 'bar' }, err => {
                expect(err).to.not.exist;
                const event = events[0];
                expect(event).nested.property('command.writeConcern.w').to.equal(0);
                expect(event).to.not.have.nested.property('command.lsid');
                done();
              });
          }
        )
      });
      it('should throw error with explicit session', {
        metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
        test: withMonitoredClient(
          'insert',
          { clientOptions: { writeConcern: { w: 0 } } },
          function (client, events, done) {
            const session = client.startSession({ causalConsistency: true });
            client
              .db('test')
              .collection('foo')
              .insertOne({ foo: 'bar' }, { session }, err => {
                expect(err).to.exist;
                expect(err.message).to.equal(
                  'Cannot have explicit session with unacknowledged writes'
                );
                client.close(done);
              });
          }
        )
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
});
