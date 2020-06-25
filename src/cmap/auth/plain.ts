'use strict';
const {
  BSON: { Binary }
} = require('../../deps');
const AuthProvider = require('./auth_provider').AuthProvider;

class Plain extends AuthProvider {
  auth(authContext, callback) {
    const { connection, credentials } = authContext;
    const username = credentials.username;
    const password = credentials.password;

    const payload = new Binary(`\x00${username}\x00${password}`);
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    connection.command('$external.$cmd', command, callback);
  }
}

module.exports = Plain;
