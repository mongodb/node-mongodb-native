'use strict';

const setupDatabase = require('./shared').setupDatabase;
const withClient = require('./shared').withClient;

describe('SASLPrep', function() {
  // Step 4
  // To test SASLprep behavior, create two users:
  // username: "IX", password "IX"
  // username: "u2168" (ROMAN NUMERAL NINE), password "u2163" (ROMAN NUMERAL FOUR)
  // To create the users, use the exact bytes for username and password without SASLprep or other normalization and specify SCRAM-SHA-256 credentials:
  // db.runCommand({createUser: 'IX', pwd: 'IX', roles: ['root'], mechanisms: ['SCRAM-SHA-256']}) db.runCommand({createUser: 'u2168', pwd: 'u2163', roles: ['root'], mechanisms: ['SCRAM-SHA-256']})
  // For each user, verify that the driver can authenticate with the password in both SASLprep normalized and non-normalized forms:
  // User "IX": use password forms "IX" and "Iu00ADX"
  // User "u2168": use password forms "IV" and "Iu00ADV"
  // As a URI, those have to be UTF-8 encoded and URL-escaped, e.g.:
  // mongodb://IX:IX@mongodb.example.com/admin
  // mongodb://IX:I%C2%ADX@mongodb.example.com/admin
  // mongodb://%E2%85%A8:IV@mongodb.example.com/admin
  // mongodb://%E2%85%A8:I%C2%ADV@mongodb.example.com/admin

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

  before(function() {
    return setupDatabase(this.configuration);
  });

  before(function() {
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

  after(function() {
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
  ].forEach(user => {
    const username = user.username;
    const password = user.password;

    it(`should be able to login with username "${username}" and password "${password}"`, {
      metadata: {
        requires: {
          mongodb: '>=3.7.3',
          node: '>=6'
        }
      },
      test: function() {
        const options = {
          user: username,
          password: password,
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
