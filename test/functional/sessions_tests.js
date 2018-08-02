'use strict';
const expect = require('chai').expect;
const setupDatabase = require('./shared').setupDatabase;

const ignoredCommands = ['ismaster'];
const test = { commands: { started: [], succeeded: [] } };
describe('Sessions', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  function parseAPMEvent(e) {
    // Some silly stuff for OP_QUERY
    if (e.commandName === 'find' && e.command && e.command.find === '$cmd') {
      const realCommand = e.command.filter;
      return Object.assign({}, e, {
        command: realCommand,
        commandName: Object.keys(realCommand)[0]
      });
    }

    return e;
  }

  beforeEach(function() {
    test.commands = { started: [], succeeded: [] };

    test.client = this.configuration.newClient(
      { w: 1 },
      { poolSize: 1, auto_reconnect: false, monitorCommands: true }
    );
    test.client.on('commandStarted', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        test.commands.started.push(parseAPMEvent(event));
      }
    });

    test.client.on('commandSucceeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) {
        test.commands.succeeded.push(parseAPMEvent(event));
      }
    });
    return test.client.connect();
  });

  it('should send endSessions for multiple sessions', {
    metadata: {
      requires: { topology: ['single'], mongodb: '>3.6.0' },
      // Skipping session leak tests b/c these are explicit sessions
      sessions: { skipLeakTests: true }
    },
    test: function(done) {
      const client = test.client;
      let sessions = [client.startSession(), client.startSession()].map(s => s.id);

      client.close(err => {
        expect(err).to.not.exist;
        expect(test.commands.started).to.have.length(1);
        expect(test.commands.started[0].commandName).to.equal('endSessions');
        expect(test.commands.started[0].command.endSessions).to.include.deep.members(sessions);

        expect(client.s.sessions).to.have.length(0);
        done();
      });
    }
  });

  describe('withSession', {
    metadata: { requires: { mongodb: '>3.6.0' } },
    test: function() {
      [
        {
          description: 'should support operations that return promises',
          operation: client => session => {
            return client
              .db('test')
              .collection('foo')
              .find({}, { session })
              .toArray();
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
        it(testCase.description, function() {
          const client = test.client;

          return client
            .withSession(testCase.operation(client))
            .catch(() => expect(client.topology.s.sessionPool.sessions).to.have.length(1))
            .then(() => expect(client.topology.s.sessionPool.sessions).to.have.length(1))
            .then(() => client.close())
            .then(() => {
              // verify that the `endSessions` command was sent
              const lastCommand = test.commands.started[test.commands.started.length - 1];
              expect(lastCommand.commandName).to.equal('endSessions');
              expect(client.topology.s.sessionPool.sessions).to.have.length(0);
            });
        });
      });

      it('supports passing options to ClientSession', function() {
        const client = test.client;

        const promise = client.withSession({ causalConsistency: false }, session => {
          expect(session.supports.causalConsistency).to.be.false;
          return client
            .db('test')
            .collection('foo')
            .find({}, { session })
            .toArray();
        });

        return promise
          .then(() => expect(client.topology.s.sessionPool.sessions).to.have.length(1))
          .then(() => client.close())
          .then(() => {
            // verify that the `endSessions` command was sent
            const lastCommand = test.commands.started[test.commands.started.length - 1];
            expect(lastCommand.commandName).to.equal('endSessions');
            expect(client.topology.s.sessionPool.sessions).to.have.length(0);
          });
      });
    }
  });
});
