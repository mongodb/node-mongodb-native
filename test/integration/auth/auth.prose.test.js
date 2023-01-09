'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { Connection } = require('../../mongodb');
const { ScramSHA256 } = require('../../mongodb');
const { setupDatabase } = require('../shared');
const { LEGACY_HELLO_COMMAND } = require('../../mongodb');

// TODO(NODE-4338): withClient usage prevented these tests from running
// the import has been removed since the function is being deleted, this is here to keep modifications minimal
// so that the implementer of the fix for these tests can try to reference the original intent
const withClient = () => null;

describe('auth prose tests', () => {
  beforeEach(function () {
    this.currentTest.skipReason = 'TODO(NODE-4338): correct withClient usage';
    this.currentTest.skip();
  });

  describe('SCRAM-SHA-256 prose test', () => {
    describe('SCRAM-SHA-256 prose test Steps 1-3', function () {
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
        test.sandbox = sinon.createSandbox();
        return setupDatabase(this.configuration);
      });

      /**
       * Step 1
       * Create three test users, one with only SHA-1, one with only SHA-256 and one with both.
       */
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

      /**
       * Step 2
       * For each test user, verify that you can connect and run a command requiring authentication for the following cases:
       * Explicitly specifying each mechanism the user supports.
       * Specifying no mechanism and relying on mechanism negotiation.
       * For the example users above, the dbstats command could be used as a test command.
       */
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

      /**
       * Step 2 (continued):
       * For a test user supporting both SCRAM-SHA-1 and SCRAM-SHA-256,
       * drivers should verify that negotation selects SCRAM-SHA-256.
       */
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

      // TODO: not spec
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
          test.sandbox
            .stub(ScramSHA256.prototype, 'auth')
            .callsFake(function (authContext, callback) {
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

      /**
       * Step 3
       * For test users that support only one mechanism, verify that explictly specifying the other mechanism fails.
       */
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

      /* Step 3 (continued):
       * For a non-existent username, verify that not specifying a mechanism when
       * connecting fails with the same error type that would occur with a correct
       * username but incorrect password or mechanism.  (Because negotiation with a
       * non-existent user name at one point during server development caused a
       * handshake error, we want to verify this is seen by users as similar to other
       * authentication errors, not as a network or database command error on the ``hello``
       * or legacy hello commands themselves.)
       */
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
              .filter(c => c.args[1][LEGACY_HELLO_COMMAND]); // only consider handshakes

            expect(calls).to.have.length(1);
            const handshakeDoc = calls[0].args[1];
            expect(handshakeDoc).to.have.property('speculativeAuthenticate');
          });
        }
      });
    });

    describe('SCRAM-SHA-256 prose test Step 4', function () {
      /**
       * Step 4
       * To test SASLprep behavior, create two users:
       * username: "IX", password "IX"
       * username: "u2168" (ROMAN NUMERAL NINE), password "u2163" (ROMAN NUMERAL FOUR)
       * To create the users, use the exact bytes for username and password without SASLprep or other normalization and specify SCRAM-SHA-256 credentials:
       * db.runCommand({createUser: 'IX', pwd: 'IX', roles: ['root'], mechanisms: ['SCRAM-SHA-256']}) db.runCommand({createUser: 'u2168', pwd: 'u2163', roles: ['root'], mechanisms: ['SCRAM-SHA-256']})
       * For each user, verify that the driver can authenticate with the password in both SASLprep normalized and non-normalized forms:
       * User "IX": use password forms "IX" and "Iu00ADX"
       * User "u2168": use password forms "IV" and "Iu00ADV"
       * As a URI, those have to be UTF-8 encoded and URL-escaped, e.g.:
       * mongodb://IX:IX@mongodb.example.com/admin
       * mongodb://IX:I%C2%ADX@mongodb.example.com/admin
       * mongodb://%E2%85%A8:IV@mongodb.example.com/admin
       * mongodb://%E2%85%A8:I%C2%ADV@mongodb.example.com/admin
       */

      const users = [
        {
          username: 'IX',
          password: 'IX',
          mechanisms: ['SCRAM-SHA-256']
        },
        {
          username: '\u2168',
          password: '\u2163',
          mechanisms: ['SCRAM-SHA-256']
        }
      ];

      before(function () {
        return setupDatabase(this.configuration);
      });

      before(function () {
        return withClient(this.configuration.newClient(), client => {
          const db = client.db('admin');

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
          const db = client.db('admin');

          return Promise.all(users.map(user => db.removeUser(user.username)));
        });
      });

      [
        { username: 'IX', password: 'IX' },
        { username: 'IX', password: 'I\u00ADX' },
        { username: 'IX', password: '\u2168' },
        { username: '\u2168', password: 'IV' },
        { username: '\u2168', password: 'I\u00ADV' },
        { username: '\u2168', password: '\u2163' }
      ].forEach(({ username, password }) => {
        it(`should be able to login with username "${username}" and password "${password}"`, {
          metadata: {
            requires: {
              mongodb: '>=3.7.3'
            }
          },
          test: function () {
            const options = {
              auth: { username, password },
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };

            return withClient(this.configuration.newClient(options), client => {
              return client.db('admin').stats();
            });
          }
        });
      });
    });
  });
});
