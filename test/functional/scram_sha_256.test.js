'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { Connection } = require('../../src/cmap/connection');
const { ScramSHA256 } = require('../../src/cmap/auth/scram');
const { setupDatabase, withClient } = require('./shared');

describe('SCRAM-SHA-256 auth', function () {
  const test = {};
  const userMap = {
    sha1: {
      description: 'user with sha1 credentials',
      username: 'sha1',
      password: 'sha1',
      mechanisms: ['SCRAM-SHA-1']
    },
    sha256: {
      description: 'user with sha256 credentials',
      username: 'sha256',
      password: 'sha256',
      mechanisms: ['SCRAM-SHA-256']
    },
    both: {
      description: 'user with both credentials',
      username: 'both',
      password: 'both',
      mechanisms: ['SCRAM-SHA-1', 'SCRAM-SHA-256']
    }
  };

  function makeConnectionString(config, username, password) {
    return `mongodb://${username}:${password}@${config.host}:${config.port}/${config.db}?`;
  }

  const users = Object.keys(userMap).map(name => userMap[name]);

  afterEach(() => test.sandbox.restore());

  before(function () {
    test.sandbox = sinon.sandbox.create();
    return setupDatabase(this.configuration);
  });

  before(function () {
    return withClient(this.configuration.newClient(), client => {
      test.oldDbName = this.configuration.db;
      this.configuration.db = 'admin';
      const db = client.db(this.configuration.db);

      const createUserCommands = users.map(user => ({
        createUser: user.username,
        pwd: user.password,
        roles: ['root'],
        mechanisms: user.mechanisms
      }));

      return Promise.all(createUserCommands.map(cmd => db.command(cmd)));
    });
  });

  after(function () {
    return withClient(this.configuration.newClient(), client => {
      const db = client.db(this.configuration.db);
      this.configuration.db = test.oldDbName;

      return Promise.all(users.map(user => db.removeUser(user.username)));
    });
  });

  //   Step 2
  // For each test user, verify that you can connect and run a command requiring authentication for the following cases:
  // Explicitly specifying each mechanism the user supports.
  // Specifying no mechanism and relying on mechanism negotiation.
  // For the example users above, the dbstats command could be used as a test command.
  users.forEach(user => {
    user.mechanisms.forEach(mechanism => {
      it(`should auth ${user.description} when explicitly specifying ${mechanism}`, {
        metadata: { requires: { mongodb: '>=3.7.3' } },
        test: function () {
          const options = {
            auth: {
              username: user.username,
              password: user.password
            },
            authMechanism: mechanism,
            authSource: this.configuration.db
          };

          return withClient(this.configuration.newClient({}, options), client => {
            return client.db(this.configuration.db).stats();
          });
        }
      });

      it(`should auth ${user.description} when explicitly specifying ${mechanism} in url`, {
        metadata: { requires: { mongodb: '>=3.7.3' } },
        test: function () {
          const username = encodeURIComponent(user.username);
          const password = encodeURIComponent(user.password);

          const url = `${makeConnectionString(
            this.configuration,
            username,
            password
          )}authMechanism=${mechanism}`;

          const client = this.configuration.newClient(url);

          return withClient(client, client => {
            return client.db(this.configuration.db).stats();
          });
        }
      });
    });

    it(`should auth ${user.description} using mechanism negotiaton`, {
      metadata: { requires: { mongodb: '>=3.7.3' } },
      test: function () {
        const options = {
          auth: {
            username: user.username,
            password: user.password
          },
          authSource: this.configuration.db
        };

        return withClient(this.configuration.newClient({}, options), client => {
          return client.db(this.configuration.db).stats();
        });
      }
    });

    it(`should auth ${user.description} using mechanism negotiaton and url`, {
      metadata: { requires: { mongodb: '>=3.7.3' } },
      test: function () {
        const username = encodeURIComponent(user.username);
        const password = encodeURIComponent(user.password);
        const url = makeConnectionString(this.configuration, username, password);

        const client = this.configuration.newClient(url);

        return withClient(client, client => {
          return client.db(this.configuration.db).stats();
        });
      }
    });
  });

  // For a test user supporting both SCRAM-SHA-1 and SCRAM-SHA-256,
  // drivers should verify that negotation selects SCRAM-SHA-256..
  it('should select SCRAM-SHA-256 for a user that supports both auth mechanisms', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function () {
      const options = {
        auth: {
          username: userMap.both.username,
          password: userMap.both.password
        },
        authSource: this.configuration.db
      };

      test.sandbox.spy(ScramSHA256.prototype, 'auth');

      return withClient(this.configuration.newClient({}, options), () => {
        expect(ScramSHA256.prototype.auth.called).to.equal(true);
      });
    }
  });

  it('should shorten SCRAM conversations if the server supports it', {
    metadata: { requires: { mongodb: '>=4.4', topology: ['single'] } },
    test: function () {
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

      return withClient(this.configuration.newClient({}, options), () => {
        expect(runCommandSpy.callCount).to.equal(1);
      });
    }
  });

  // Step 3
  // For test users that support only one mechanism, verify that explictly specifying the other mechanism fails.
  it('should fail to connect if incorrect auth mechanism is explicitly specified', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function () {
      const options = {
        auth: {
          username: userMap.sha256.username,
          password: userMap.sha256.password
        },
        authSource: this.configuration.db,
        authMechanism: 'SCRAM-SHA-1'
      };

      return withClient(
        this.configuration.newClient({}, options),
        () => Promise.reject(new Error('This request should have failed to authenticate')),
        err => expect(err).to.match(/Authentication failed/)
      );
    }
  });

  // For a non-existent username, verify that not specifying a mechanism when connecting fails with the same error
  // type that would occur with a correct username but incorrect password or mechanism. (Because negotiation with
  // a non-existent user name causes an isMaster error, we want to verify this is seen by users as similar to other
  // authentication errors, not as a network or database command error.)
  it('should fail for a nonexistent username with same error type as bad password', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function () {
      const noUsernameOptions = {
        auth: {
          username: 'roth',
          password: 'pencil'
        },
        authSource: 'admin'
      };

      const badPasswordOptions = {
        auth: {
          username: 'both',
          password: 'pencil'
        },
        authSource: 'admin'
      };

      const getErrorMsg = options =>
        withClient(
          this.configuration.newClient({}, options),
          () => Promise.reject(new Error('This request should have failed to authenticate')),
          err => expect(err).to.match(/Authentication failed/)
        );

      return Promise.all([getErrorMsg(noUsernameOptions), getErrorMsg(badPasswordOptions)]);
    }
  });

  it('should send speculativeAuthenticate on initial handshake on MongoDB 4.4+', {
    metadata: { requires: { mongodb: '>=4.4', topology: ['single'] } },
    test: function () {
      const options = {
        auth: {
          username: userMap.both.username,
          password: userMap.both.password
        },
        authSource: this.configuration.db
      };

      const commandSpy = test.sandbox.spy(Connection.prototype, 'command');
      return withClient(this.configuration.newClient({}, options), () => {
        const calls = commandSpy
          .getCalls()
          .filter(c => c.thisValue.id !== '<monitor>') // ignore all monitor connections
          .filter(c => c.args[1].ismaster); // only consider handshakes

        expect(calls).to.have.length(1);
        const handshakeDoc = calls[0].args[1];
        expect(handshakeDoc).to.have.property('speculativeAuthenticate');
      });
    }
  });
});
