'use strict';

const { expect } = require('chai');
const { MongoServerError } = require('../../../src');
const { setupDatabase, withMonitoredClient } = require('../shared');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

const ignoredCommands = [LEGACY_HELLO_COMMAND];
const test = {
  commands: { started: [], succeeded: [] },
  setup: function (config) {
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
          let sessions = [client.startSession(), client.startSession()].map(s => s.id);

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

    describe('withSession', {
      metadata: {
        requires: {
          mongodb: '>=3.6.0'
        }
      },
      test: function () {
        beforeEach(function () {
          return test.setup(this.configuration);
        });

        [
          {
            description: 'should support operations that return promises',
            operation: client => session => {
              return client.db('test').collection('foo').find({}, { session }).toArray();
            }
          },
          // {
          //   nodeVersion: '>=8.x',
          //   description: 'should support async operations',
          //   operation: client => session =>
          //     async function() {
          //       await client
          //         .db('test')
          //         .collection('foo')
          //         .find({}, { session })
          //         .toArray();
          //     }
          // },
          {
            description: 'should support operations that return rejected promises',
            operation: (/* client */) => (/* session */) => {
              return Promise.reject(new Error('something awful'));
            }
          },
          {
            description: "should support operations that don't return promises",
            operation: (/* client */) => (/* session */) => {
              setTimeout(() => {});
            }
          },
          {
            description: 'should support operations that throw exceptions',
            operation: (/* client */) => (/* session */) => {
              throw new Error('something went wrong!');
            }
          }
        ].forEach(testCase => {
          it(testCase.description, function () {
            const client = test.client;

            return client
              .withSession(testCase.operation(client))
              .then(
                () => expect(client.topology.s.sessionPool.sessions).to.have.length(1),
                () => expect(client.topology.s.sessionPool.sessions).to.have.length(1)
              )
              .then(() => client.close())
              .then(() => {
                // verify that the `endSessions` command was sent
                const lastCommand = test.commands.started[test.commands.started.length - 1];
                expect(lastCommand.commandName).to.equal('endSessions');
                expect(client.topology).to.not.exist;
              });
          });
        });

        it('supports passing options to ClientSession', function () {
          const client = test.client;

          const promise = client.withSession({ causalConsistency: false }, session => {
            expect(session.supports.causalConsistency).to.be.false;
            return client.db('test').collection('foo').find({}, { session }).toArray();
          });

          return promise
            .then(() => expect(client.topology.s.sessionPool.sessions).to.have.length(1))
            .then(() => client.close())
            .then(() => {
              // verify that the `endSessions` command was sent
              const lastCommand = test.commands.started[test.commands.started.length - 1];
              expect(lastCommand.commandName).to.equal('endSessions');
              expect(client.topology).to.not.exist;
            });
        });
      }
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
