'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const ScramSHA256 = require('../../lib/core/auth/scram').ScramSHA256;
const setupDatabase = require('./shared').setupDatabase;
const withClient = require('./shared').withClient;

const wireprotocol = require('../../lib/core/wireprotocol');

const makeConnectionString = (config, username, password) =>
  `mongodb://${username}:${password}@${config.host}:${config.port}/${config.db}?`;

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
const users = Object.values(userMap);

describe('ScramSHA256', function() {
  const test = {};

  afterEach(() => test.sandbox.restore());

  before(function() {
    test.sandbox = sinon.sandbox.create();
    return setupDatabase(this.configuration);
  });

  before(function() {
    return withClient(this.configuration.newClient(), client => {
      test.oldDbName = this.configuration.db;
      this.configuration.db = 'admin';
      const db = client.db(this.configuration.db);

      const createUserCommands = users.map(user =>
        db.command({
          createUser: user.username,
          pwd: user.password,
          roles: ['root'],
          mechanisms: user.mechanisms
        })
      );

      return Promise.all(createUserCommands);
    });
  });

  after(function() {
    return withClient(this.configuration.newClient(), client => {
      const db = client.db(this.configuration.db);
      this.configuration.db = test.oldDbName;

      return Promise.all(users.map(user => db.removeUser(user.username)));
    });
  });

  // Step 2:
  // For each test user,
  // verify that you can connect and run a command requiring authentication for the following cases:
  // Explicitly specifying each mechanism the user supports.
  // Specifying no mechanism and relying on mechanism negotiation.
  // For the example users above, the dbstats command could be used as a test command.
  users.forEach(user => {
    user.mechanisms.forEach(mechanism => {
      it(`should auth ${user.description} when explicitly specifying ${mechanism}`, {
        metadata: { requires: { mongodb: '>=3.7.3' } },
        test: function() {
          const options = {
            auth: {
              user: user.username,
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
        test: function() {
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

    it(`should auth ${user.description} using mechanism negotiation`, {
      metadata: { requires: { mongodb: '>=3.7.3 <4.3.5' } },
      test: function() {
        const options = {
          auth: {
            user: user.username,
            password: user.password
          },
          authSource: this.configuration.db
        };

        return withClient(this.configuration.newClient({}, options), client => {
          return client.db(this.configuration.db).stats();
        });
      }
    });

    it(`should auth ${user.description} using mechanism negotiation and url`, {
      metadata: { requires: { mongodb: '>=3.7.3 <4.3.5' } },
      test: function() {
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
  // drivers should verify that negotiation selects SCRAM-SHA-256..
  it('should select SCRAM-SHA-256 for a user that supports both auth mechanisms', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function() {
      const options = {
        auth: {
          user: userMap.both.username,
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

  it('should shorten SCRAM conversations if the server supports it ', {
    metadata: { requires: { mongodb: '>=4.3.4 <4.3.5' } },
    test: function() {
      const options = {
        auth: {
          user: userMap.both.username,
          password: userMap.both.password
        },
        authSource: this.configuration.db
      };

      let sendAuthCommandSpy;
      test.sandbox
        .stub(ScramSHA256.prototype, '_executeScram')
        .callsFake(function(
          sendAuthCommand,
          connection,
          credentials,
          nonce,
          saslStartCmd,
          callback
        ) {
          const executeScram = ScramSHA256.prototype._executeScram.wrappedMethod;
          sendAuthCommandSpy = test.sandbox.spy(sendAuthCommand);
          executeScram.apply(this, [
            sendAuthCommandSpy,
            connection,
            credentials,
            nonce,
            saslStartCmd,
            callback
          ]);
        });

      return withClient(this.configuration.newClient({}, options), () => {
        expect(sendAuthCommandSpy.callCount).to.equal(2);
      });
    }
  });

  // Step 3
  // For test users that support only one mechanism, verify that explicitly specifying the other mechanism fails.
  it('should fail to connect if incorrect auth mechanism is explicitly specified', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function() {
      const options = {
        auth: {
          user: userMap.sha256.username,
          password: userMap.sha256.password
        },
        authSource: this.configuration.db,
        authMechanism: 'SCRAM-SHA-1',
        serverSelectionTimeoutMS: 100
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
    test: function() {
      const noUsernameOptions = {
        auth: {
          user: 'roth',
          password: 'pencil'
        },
        authSource: 'admin',
        serverSelectionTimeoutMS: 100
      };

      const badPasswordOptions = {
        auth: {
          user: 'both',
          password: 'BadPassword'
        },
        authSource: 'admin',
        serverSelectionTimeoutMS: 100
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

  it('should speculatively authenticate', {
    metadata: { requires: { mongodb: '>=4.3.5' }, useUnifiedTopology: true },
    test: function() {
      const commandSpy = test.sandbox.spy(wireprotocol, 'command');

      const options = {
        auth: {
          user: userMap.sha256.username,
          password: userMap.sha256.password
        },
        authSource: 'admin'
      };

      return withClient(this.configuration.newClient({}, options), () => {
        const firstIsMaster = commandSpy.getCall(0).args[2];
        const saslContinueCommand = commandSpy.getCall(1).args[2];
        expect(firstIsMaster).to.have.property('speculativeAuthenticate');
        expect(saslContinueCommand).to.have.property('saslContinue');
      });
    }
  });

  it('should handle no response to speculative authenticate', {
    metadata: { requires: { mongodb: '<4.3.5' }, useUnifiedTopology: true },
    test: function() {
      const commandSpy = test.sandbox.spy(wireprotocol, 'command');

      const options = {
        auth: {
          user: userMap.sha256.username,
          password: userMap.sha256.password
        },
        authSource: 'admin'
      };

      return withClient(this.configuration.newClient({}, options), () => {
        const firstIsMaster = commandSpy.getCall(0).args[2];
        const saslStartCommand = commandSpy.getCall(1).args[2];
        expect(firstIsMaster).to.have.property('speculativeAuthenticate');
        expect(saslStartCommand).to.have.property('saslStart');
      });
    }
  });
});
