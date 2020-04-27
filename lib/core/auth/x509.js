'use strict';
const AuthProvider = require('./auth_provider').AuthProvider;

class X509 extends AuthProvider {
  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;

    const username = credentials.username;
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (username) {
      command.user = username;
    }

    connection.command('$external.$cmd', command, callback);
  }
}

module.exports = X509;
