'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const ScramSHA256 = require('mongodb-core').ScramSHA256;
const MongoError = require('mongodb-core').MongoError;
const setupDatabase = require('./shared').setupDatabase;
const withClient = require('./shared').withClient;
const MongoClient = require('../../lib/mongo_client');

describe('SCRAM-SHA-256 auth', function() {
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

  before(function() {
    if (this.configuration.usingUnifiedTopology()) {
      // The unified topology does not presently support authentication
      return this.skip();
    }

    test.sandbox = sinon.sandbox.create();
    return setupDatabase(this.configuration);
  });

  before(function() {
    if (this.configuration.usingUnifiedTopology()) {
      // The unified topology does not presently support authentication
      return this.skip();
    }

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

  after(function() {
    if (this.configuration.usingUnifiedTopology()) {
      // The unified topology does not presently support authentication
      return this.skip();
    }

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

          const client = new MongoClient(url);

          return withClient(client, client => {
            return client.db(this.configuration.db).stats();
          });
        }
      });
    });

    it(`should auth ${user.description} using mechanism negotiaton`, {
      metadata: { requires: { mongodb: '>=3.7.3' } },
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

    it(`should auth ${user.description} using mechanism negotiaton and url`, {
      metadata: { requires: { mongodb: '>=3.7.3' } },
      test: function() {
        const username = encodeURIComponent(user.username);
        const password = encodeURIComponent(user.password);
        const url = makeConnectionString(this.configuration, username, password);

        const client = new MongoClient(url);

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
        expect(ScramSHA256.prototype.auth.calledOnce).to.equal(true);
      });
    }
  });

  // Step 3
  // For test users that support only one mechanism, verify that explictly specifying the other mechanism fails.
  it('should fail to connect if incorrect auth mechanism is explicitly specified', {
    metadata: { requires: { mongodb: '>=3.7.3' } },
    test: function() {
      const options = {
        auth: {
          user: userMap.sha256.username,
          password: userMap.sha256.password
        },
        authSource: this.configuration.db,
        authMechanism: 'SCRAM-SHA-1'
      };

      return withClient(
        this.configuration.newClient({}, options),
        () => Promise.reject(new Error('This request should have failed to authenticate')),
        err => expect(err).to.not.be.null
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
        authSource: 'admin'
      };

      const badPasswordOptions = {
        auth: {
          user: 'both',
          password: 'pencil'
        },
        authSource: 'admin'
      };

      const getErrorMsg = options =>
        withClient(
          this.configuration.newClient({}, options),
          () => Promise.reject(new Error('This request should have failed to authenticate')),
          err => expect(err).to.be.an.instanceof(MongoError)
        );

      return Promise.all([getErrorMsg(noUsernameOptions), getErrorMsg(badPasswordOptions)]);
    }
  });
});
