'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { Connection } = require('../../../src/cmap/connection');
const { ScramSHA256 } = require('../../../src/cmap/auth/scram');
const { setupDatabase } = require('../shared');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

describe('SCRAM_SHA_256', function () {
  const test = {};

  // Note: this setup was adapted from the prose test setup
  const userMap = {
    both: {
      description: 'user with both credentials',
      username: 'both',
      password: 'both',
      mechanisms: ['SCRAM-SHA-1', 'SCRAM-SHA-256']
    }
  };

  const users = Object.keys(userMap).map(name => userMap[name]);

  afterEach(() => test.sandbox.restore());

  before(function () {
    test.sandbox = sinon.createSandbox();
    return setupDatabase(this.configuration);
  });

  before(async function () {
    const client = this.configuration.newClient();
    test.oldDbName = this.configuration.db;
    this.configuration.db = 'admin';
    const db = client.db(this.configuration.db);

    const createUserCommands = users.map(user => ({
      createUser: user.username,
      pwd: user.password,
      roles: ['root'],
      mechanisms: user.mechanisms
    }));

    await Promise.all(createUserCommands.map(cmd => db.command(cmd)));
    await client.close();
  });

  after(async function () {
    const client = this.configuration.newClient();
    const db = client.db(this.configuration.db);
    this.configuration.db = test.oldDbName;

    await Promise.all(users.map(user => db.removeUser(user.username)));
    await client.close();
  });

  it('should shorten SCRAM conversations if the server supports it', {
    metadata: { requires: { mongodb: '>=4.4', topology: ['single'] } },
    test: async function () {
      const options = {
        auth: {
          username: userMap.both.username,
          password: userMap.both.password
        },
        authSource: this.configuration.db
      };

      let runCommandSpy;
      test.sandbox.stub(ScramSHA256.prototype, 'auth').callsFake(function (authContext, callback) {
        const connection = authContext.connection;
        const auth = ScramSHA256.prototype.auth.wrappedMethod;
        runCommandSpy = test.sandbox.spy(connection, 'command');
        function _callback(err, res) {
          runCommandSpy.restore();
          callback(err, res);
        }

        auth.apply(this, [authContext, _callback]);
      });

      const client = this.configuration.newClient({}, options);
      await client.db().command({ ping: 1 });
      expect(runCommandSpy.callCount).to.equal(1);
      await client.close();
    }
  });

  it('should send speculativeAuthenticate on initial handshake on MongoDB 4.4+', {
    metadata: { requires: { mongodb: '>=4.4', topology: ['single'] } },
    test: async function () {
      const options = {
        auth: {
          username: userMap.both.username,
          password: userMap.both.password
        },
        authSource: this.configuration.db
      };

      const commandSpy = test.sandbox.spy(Connection.prototype, 'command');
      const client = this.configuration.newClient({}, options);
      await client.db().command({ ping: 1 });
      const calls = commandSpy
        .getCalls()
        .filter(c => c.thisValue.id !== '<monitor>') // ignore all monitor connections
        .filter(c => c.args[1][LEGACY_HELLO_COMMAND]); // only consider handshakes

      expect(calls).to.have.length(1);
      const handshakeDoc = calls[0].args[1];
      expect(handshakeDoc).to.have.property('speculativeAuthenticate');
      await client.close();
    }
  });
});
