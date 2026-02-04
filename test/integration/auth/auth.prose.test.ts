import { expect } from 'chai';
import * as process from 'process';
import * as sinon from 'sinon';

import { Connection, LEGACY_HELLO_COMMAND, type MongoClient, ScramSHA256 } from '../../mongodb';
import { type TestConfiguration } from '../../tools/runner/config';

function makeConnectionString(config, username, password) {
  return `mongodb://${username}:${password}@${config.host}:${config.port}/admin?`;
}

const metadata: MongoDBMetadataUI = {
  requires: {
    predicate: () =>
      process.env.LOAD_BALANCER ? 'TODO(NODE-5631): fix tests to run in load balancer mode.' : true,
    tls: 'disabled'
  }
};

describe('Authentication Spec Prose Tests', function () {
  describe('SCRAM-SHA-256 and mechanism negotiation', () => {
    describe('Steps 1-3', function () {
      const userMap = {
        sha1: {
          description: 'user with SCRAM-SHA-1',
          username: 'sha1',
          password: 'sha1',
          mechanisms: ['SCRAM-SHA-1']
        },
        sha256: {
          description: 'user with SCRAM-SHA-256',
          username: 'sha256',
          password: 'sha256',
          mechanisms: ['SCRAM-SHA-256']
        },
        both: {
          description: 'user with SCRAM-SHA-1 and SCRAM-SHA-256',
          username: 'both',
          password: 'both',
          mechanisms: ['SCRAM-SHA-1', 'SCRAM-SHA-256']
        }
      };
      const users = Object.keys(userMap).map(name => userMap[name]);
      let utilClient: MongoClient;
      let client: MongoClient;

      /**
       * Step 1
       * Create three test users, one with only SHA-1, one with only SHA-256 and one with
       * both. For example:
       * db.runCommand(\{createUser: 'sha1', pwd: 'sha1', roles: ['root'], mechanisms: ['SCRAM-SHA-1']\})
       * db.runCommand(\{createUser: 'sha256', pwd: 'sha256', roles: ['root'], mechanisms: ['SCRAM-SHA-256']\})
       * db.runCommand(\{createUser: 'both', pwd: 'both', roles: ['root'], mechanisms: ['SCRAM-SHA-1', 'SCRAM-SHA-256']\})
       */
      beforeEach(async function () {
        utilClient = this.configuration.newClient();

        const createUserCommands = users.map(user => ({
          createUser: user.username,
          pwd: user.password,
          roles: ['root'],
          mechanisms: user.mechanisms
        }));

        await Promise.all(createUserCommands.map(cmd => utilClient.db('admin').command(cmd)));
      });

      afterEach(async function () {
        await Promise.all(users.map(user => utilClient.db('admin').removeUser(user.username)));
        await utilClient?.close();
        await client?.close();
        sinon.restore();
      });

      /**
       * Step 2
       * For each test user, verify that you can connect and run a command requiring
       * authentication for the following cases:
       *   - Explicitly specifying each mechanism the user supports.
       *   - Specifying no mechanism and relying on mechanism negotiation.
       */
      for (const user of users) {
        for (const mechanism of user.mechanisms) {
          it(
            `authenticates ${user.description} when explicitly specifying ${mechanism} via client options`,
            metadata,
            async function () {
              const options = {
                auth: {
                  username: user.username,
                  password: user.password
                },
                authMechanism: mechanism,
                authSource: 'admin'
              };

              client = this.configuration.newClient({}, options);
              const stats = await client.db('test').stats();
              expect(stats).to.exist;
            }
          );

          it(
            `authenticates ${user.description} when explicitly specifying ${mechanism} in url`,
            metadata,
            async function () {
              const username = encodeURIComponent(user.username);
              const password = encodeURIComponent(user.password);

              const url = `${makeConnectionString(
                this.configuration,
                username,
                password
              )}authMechanism=${mechanism}`;

              client = this.configuration.newClient(url);
              const stats = await client.db('test').stats();
              expect(stats).to.exist;
            }
          );
        }

        it(
          `authenticates ${user.description} using mechanism negotiaton`,
          metadata,
          async function () {
            const options = {
              auth: {
                username: user.username,
                password: user.password
              },
              authSource: 'admin'
            };

            client = this.configuration.newClient({}, options);
            const stats = await client.db('test').stats();
            expect(stats).to.exist;
          }
        );

        it(
          `authenticates ${user.description} using mechanism negotiaton and url`,
          metadata,
          async function () {
            const username = encodeURIComponent(user.username);
            const password = encodeURIComponent(user.password);
            const url = makeConnectionString(this.configuration, username, password);

            client = this.configuration.newClient(url);
            const stats = await client.db('test').stats();
            expect(stats).to.exist;
          }
        );
      }

      /**
       * Step 2
       * For a test user supporting both SCRAM-SHA-1 and SCRAM-SHA-256, drivers should verify
       * that negotation selects SCRAM-SHA-256. This may require monkey patching, manual log
       * analysis, etc.
       * todo(NODE-5629): Test passes locally but will fail on CI runs.
       */
      it.skip(
        'selects SCRAM-SHA-256 for a user that supports both auth mechanisms',
        metadata,
        async function () {
          const options = {
            auth: {
              username: userMap.both.username,
              password: userMap.both.password
            },
            authSource: this.configuration.db
          };

          client = this.configuration.newClient({}, options);
          const spy = sinon.spy(ScramSHA256.prototype, 'auth');
          const stats = await client.db('test').stats();
          expect(stats).to.exist;
          expect(spy.called).to.equal(true);
        }
      ).skipReason = 'todo(NODE-5629): Test passes locally but will fail on CI runs.';

      /**
       * Step 3
       * For test users that support only one mechanism, verify that explictly specifying
       * the other mechanism fails.
       */
      it(
        'fails to connect if incorrect auth mechanism (SCRAM-SHA-1) is explicitly specified',
        metadata,
        async function () {
          const options = {
            auth: {
              username: userMap.sha256.username,
              password: userMap.sha256.password
            },
            authSource: 'admin',
            authMechanism: 'SCRAM-SHA-1'
          };

          client = this.configuration.newClient({}, options);
          const error = await client
            .db('test')
            .stats()
            .catch(e => e);
          expect(error.message).to.match(/Authentication failed|SCRAM/);
        }
      );

      it(
        'fails to connect if incorrect auth mechanism (SCRAM-SHA-256) is explicitly specified',
        metadata,
        async function () {
          const options = {
            auth: {
              username: userMap.sha1.username,
              password: userMap.sha1.password
            },
            authSource: 'admin',
            authMechanism: 'SCRAM-SHA-256'
          };

          client = this.configuration.newClient({}, options);
          const error = await client
            .db('test')
            .stats()
            .catch(e => e);
          expect(error.message).to.match(/Authentication failed|SCRAM/);
        }
      );

      /*
       * Step 3
       * For a non-existent username, verify that not specifying a mechanism when
       * connecting fails with the same error type that would occur with a correct
       * username but incorrect password or mechanism.  (Because negotiation with a
       * non-existent user name at one point during server development caused a
       * handshake error, we want to verify this is seen by users as similar to other
       * authentication errors, not as a network or database command error on the ``hello``
       * or legacy hello commands themselves.)
       */
      it(
        'fails for a nonexistent username with same error type as bad password',
        metadata,
        async function () {
          const noUsernameOptions = {
            auth: {
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

          try {
            this.configuration.newClient({}, noUsernameOptions);
            expect.fail('Creating a new client with a password and no user must fail validation.');
          } catch (noUserError) {
            // NOTE: This prose test fails Node's validation of the credentials object - a username
            // MUST always be provided but it satisfies the test requirement of not getting a
            // network or command error on the handshake.
            expect(noUserError).to.match(/username/);
          }
          const badPasswordClient = this.configuration.newClient({}, badPasswordOptions);
          const badPasswordError = await badPasswordClient
            .db('test')
            .stats()
            .catch(e => e);
          expect(badPasswordError).to.match(/Authentication failed/);
          await badPasswordClient.close();
        }
      );

      it(
        'sends speculativeAuthenticate on initial handshake on MongoDB',
        metadata,
        async function () {
          const options = {
            auth: {
              username: userMap.both.username,
              password: userMap.both.password
            },
            authSource: 'admin'
          };

          client = this.configuration.newClient({}, options);
          const commandSpy = sinon.spy(Connection.prototype, 'command');
          await client.connect();
          const calls = commandSpy
            .getCalls()
            .filter(c => c.thisValue.id !== '<monitor>') // ignore all monitor connections
            .filter(
              c => c.args[1][process.env.MONGODB_API_VERSION ? 'hello' : LEGACY_HELLO_COMMAND]
            );

          expect(calls).to.have.length(1);
          const handshakeDoc = calls[0].args[1];
          expect(handshakeDoc).to.have.property('speculativeAuthenticate');
        }
      );
    });

    describe('Step 4', function () {
      /**
       * Step 4
       * To test SASLprep behavior, create two users:
       * username: "IX", password "IX"
       * username: "u2168" (ROMAN NUMERAL NINE), password "u2163" (ROMAN NUMERAL FOUR)
       * To create the users, use the exact bytes for username and password without SASLprep or other normalization and specify SCRAM-SHA-256 credentials:
       * db.runCommand(\{createUser: 'IX', pwd: 'IX', roles: ['root'], mechanisms: ['SCRAM-SHA-256']\})
       * db.runCommand(\{createUser: 'u2168', pwd: 'u2163', roles: ['root'], mechanisms: ['SCRAM-SHA-256']\})
       * For each user, verify that the driver can authenticate with the password in both SASLprep normalized and non-normalized forms:
       * User "IX": use password forms "IX" and "Iu00ADX"
       * User "u2168": use password forms "IV" and "Iu00ADV"
       * As a URI, those have to be UTF-8 encoded and URL-escaped, e.g.:
       * mongodb://IX:IX\@mongodb.example.com/admin
       * mongodb://IX:I%C2%ADX\@mongodb.example.com/admin
       * mongodb://%E2%85%A8:IV\@mongodb.example.com/admin
       * mongodb://%E2%85%A8:I%C2%ADV\@mongodb.example.com/admin
       */
      let client: MongoClient;
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

      async function cleanUpUsers(configuration: TestConfiguration) {
        const utilClient = configuration.newClient();
        const db = utilClient.db('admin');

        await Promise.allSettled(users.map(user => db.removeUser(user.username)));

        await utilClient.close();
      }

      async function createUsers(configuration: TestConfiguration) {
        const utilClient = configuration.newClient();
        const db = utilClient.db('admin');

        const createUserCommands = users.map(user => ({
          createUser: user.username,
          pwd: user.password,
          roles: ['root'],
          mechanisms: user.mechanisms
        }));

        const failures = await Promise.allSettled(
          createUserCommands.map(cmd => db.command(cmd))
        ).then(resolutions => resolutions.filter(resolution => resolution.status === 'rejected'));

        await utilClient.close();

        if (failures.length) {
          throw new Error(
            'Error(s) creating users: ' + failures.map(failure => failure.reason).join(' | ')
          );
        }
      }

      before(async function () {
        await cleanUpUsers(this.configuration);
        await createUsers(this.configuration);
      });

      after(function () {
        return cleanUpUsers(this.configuration);
      });

      afterEach(async function () {
        await client?.close();
      });

      context('auth credentials in options', () => {
        it('logs in with non-normalized username and password', metadata, async function () {
          const options = {
            auth: { username: 'IX', password: 'IX' },
            authSource: 'admin',
            authMechanism: 'SCRAM-SHA-256'
          };

          client = this.configuration.newClient({}, options);
          const stats = await client.db('admin').stats();
          expect(stats).to.exist;
        });

        it(
          'logs in with non-normalized username and normalized password',
          metadata,
          async function () {
            const options = {
              auth: { username: 'IX', password: 'I\u00ADX' },
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };

            client = this.configuration.newClient({}, options);
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          }
        );

        it(
          'logs in with normalized username and non-normalized password',
          metadata,
          async function () {
            const options = {
              auth: { username: '\u2168', password: 'IV' },
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };

            client = this.configuration.newClient({}, options);
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          }
        );

        it('logs in with normalized username and normalized password', metadata, async function () {
          const options = {
            auth: { username: '\u2168', password: 'I\u00ADV' },
            authSource: 'admin',
            authMechanism: 'SCRAM-SHA-256'
          };

          client = this.configuration.newClient({}, options);
          const stats = await client.db('admin').stats();
          expect(stats).to.exist;
        });
      });

      context('auth credentials in url', () => {
        context('encoded', () => {
          it('logs in with not encoded username and password', metadata, async function () {
            const options = {
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };
            client = this.configuration.newClient(
              this.configuration.url({ username: 'IX', password: 'IX' }),
              options
            );
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          });

          it('logs in with not encoded username and encoded password', metadata, async function () {
            const options = {
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };
            client = this.configuration.newClient(
              this.configuration.url({ username: 'IX', password: 'I%C2%ADX' }),
              options
            );
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          });

          it('logs in with encoded username and not encoded password', metadata, async function () {
            const options = {
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };
            client = this.configuration.newClient(
              this.configuration.url({ username: '%E2%85%A8', password: 'IV' }),
              options
            );
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          });

          it('logs in with encoded username and encoded password', metadata, async function () {
            const options = {
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };
            client = this.configuration.newClient(
              this.configuration.url({ username: '%E2%85%A8', password: 'I%C2%ADV' }),
              options
            );
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          });
        });

        context('normalized', () => {
          it('logs in with non-normalized username and password', metadata, async function () {
            const options = {
              authSource: 'admin',
              authMechanism: 'SCRAM-SHA-256'
            };
            client = this.configuration.newClient(
              this.configuration.url({ username: 'IX', password: 'IX' }),
              options
            );
            const stats = await client.db('admin').stats();
            expect(stats).to.exist;
          });

          it(
            'logs in with non-normalized username and normalized password',
            metadata,
            async function () {
              const options = {
                authSource: 'admin',
                authMechanism: 'SCRAM-SHA-256'
              };
              client = this.configuration.newClient(
                this.configuration.url({ username: 'IX', password: 'I\u00ADX' }),
                options
              );
              const stats = await client.db('admin').stats();
              expect(stats).to.exist;
            }
          );

          it(
            'logs in with normalized username and non-normalized password',
            metadata,
            async function () {
              const options = {
                authSource: 'admin',
                authMechanism: 'SCRAM-SHA-256'
              };
              client = this.configuration.newClient(
                this.configuration.url({ username: '\u2168', password: 'I\u00ADV' }),
                options
              );
              const stats = await client.db('admin').stats();
              expect(stats).to.exist;
            }
          );

          it(
            'logs in with normalized username and normalized password',
            metadata,
            async function () {
              const options = {
                authSource: 'admin',
                authMechanism: 'SCRAM-SHA-256'
              };
              client = this.configuration.newClient(
                this.configuration.url({ username: '\u2168', password: 'I\u00ADV' }),
                options
              );
              const stats = await client.db('admin').stats();
              expect(stats).to.exist;
            }
          );
        });
      });
    });
  });
});
