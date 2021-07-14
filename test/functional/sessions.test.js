'use strict';

const path = require('path');
const expect = require('chai').expect;
const { setupDatabase, withMonitoredClient } = require('./shared');
const { TestRunnerContext, generateTopologyTests } = require('./spec-runner');
const { loadSpecTests } = require('../spec');
const { runUnifiedTest } = require('./unified-spec-runner/runner');

const ignoredCommands = ['ismaster'];
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

describe('Sessions - functional', function () {
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
    metadata: { requires: { mongodb: '>=3.6.0' } },
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

  describe('legacy spec tests', function () {
    class SessionSpecTestContext extends TestRunnerContext {
      assertSessionNotDirty(options) {
        const session = options.session;
        expect(session.serverSession.isDirty).to.be.false;
      }

      assertSessionDirty(options) {
        const session = options.session;
        expect(session.serverSession.isDirty).to.be.true;
      }

      assertSameLsidOnLastTwoCommands() {
        expect(this.commandEvents).to.have.length.of.at.least(2);
        const lastTwoCommands = this.commandEvents.slice(-2).map(c => c.command);
        lastTwoCommands.forEach(command => expect(command).to.have.property('lsid'));
        expect(lastTwoCommands[0].lsid).to.eql(lastTwoCommands[1].lsid);
      }

      assertDifferentLsidOnLastTwoCommands() {
        expect(this.commandEvents).to.have.length.of.at.least(2);
        const lastTwoCommands = this.commandEvents.slice(-2).map(c => c.command);
        lastTwoCommands.forEach(command => expect(command).to.have.property('lsid'));
        expect(lastTwoCommands[0].lsid).to.not.eql(lastTwoCommands[1].lsid);
      }
    }

    const testContext = new SessionSpecTestContext();
    const testSuites = loadSpecTests(path.join('sessions', 'legacy'));

    after(() => testContext.teardown());
    before(function () {
      return testContext.setup(this.configuration);
    });

    function testFilter(spec) {
      const SKIP_TESTS = [
        // These two tests need to run against multiple mongoses
        'Dirty explicit session is discarded',
        'Dirty implicit session is discarded (write)'
      ];

      return SKIP_TESTS.indexOf(spec.description) === -1;
    }

    generateTopologyTests(testSuites, testContext, testFilter);
  });

  describe('unified spec tests', function () {
    for (const sessionTests of loadSpecTests(path.join('sessions', 'unified'))) {
      expect(sessionTests).to.be.an('object');
      context(String(sessionTests.description), function () {
        // TODO: NODE-3393 fix test runner to apply session to all operations
        const skipTestMap = {
          'snapshot-sessions': [
            'countDocuments operation with snapshot',
            'Distinct operation with snapshot',
            'Mixed operation with snapshot'
          ],
          'snapshot-sessions-not-supported-client-error': [
            'Client error on distinct with snapshot'
          ],
          'snapshot-sessions-not-supported-server-error': [
            'Server returns an error on distinct with snapshot'
          ],
          'snapshot-sessions-unsupported-ops': [
            'Server returns an error on listCollections with snapshot',
            'Server returns an error on listDatabases with snapshot',
            'Server returns an error on listIndexes with snapshot',
            'Server returns an error on runCommand with snapshot',
            'Server returns an error on findOneAndUpdate with snapshot',
            'Server returns an error on deleteOne with snapshot',
            'Server returns an error on updateOne with snapshot'
          ]
        };
        const testsToSkip = skipTestMap[sessionTests.description] || [];
        for (const test of sessionTests.tests) {
          it(String(test.description), {
            metadata: { sessions: { skipLeakTests: true } },
            test: async function () {
              await runUnifiedTest(this, sessionTests, test, testsToSkip);
            }
          });
        }
      });
    }
  });

  context('unacknowledged writes', () => {
    it('should not include session for unacknowledged writes', {
      metadata: { requires: { topology: 'single', mongodb: '>=3.6.0' } },
      test: withMonitoredClient('insert', { clientOptions: { writeConcern: { w: 0 } } }, function (
        client,
        events,
        done
      ) {
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
      })
    });
    it('should throw error with explicit session', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      test: withMonitoredClient('insert', { clientOptions: { writeConcern: { w: 0 } } }, function (
        client,
        events,
        done
      ) {
        const session = client.startSession({ causalConsistency: true });
        client
          .db('test')
          .collection('foo')
          .insertOne({ foo: 'bar' }, { session }, err => {
            expect(err).to.exist;
            expect(err.message).to.equal('Cannot have explicit session with unacknowledged writes');
            client.close(done);
          });
      })
    });
  });
});
