'use strict';
const expect = require('chai').expect,
  mongo = require('../..'),
  setupDatabase = require('./shared').setupDatabase;

const ignoredCommands = ['ismaster'];
const test = { commands: { started: [], succeeded: [] } };
describe('Sessions', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  afterEach(() => test.listener.uninstrument());
  beforeEach(function() {
    test.commands = { started: [], succeeded: [] };
    test.listener = mongo.instrument(err => expect(err).to.be.null);
    test.listener.on('started', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.started.push(event);
    });

    test.listener.on('succeeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.succeeded.push(event);
    });

    test.client = this.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
    return test.client.connect();
  });

  it('should send endSessions for multiple sessions', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      var client = this.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      client.connect((err, client) => {
        let sessions = [client.startSession(), client.startSession()].map(s => s.id);

        client.close(err => {
          expect(err).to.not.exist;
          expect(test.commands.started).to.have.length(1);
          expect(test.commands.started[0].commandName).to.equal('endSessions');
          expect(test.commands.started[0].command.endSessions).to.include.deep.members(sessions);

          expect(client.s.sessions).to.have.length(0);
          done();
        });
      });
    }
  });
});
