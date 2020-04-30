'use strict';

const AuthProvider = require('./auth_provider').AuthProvider;

/**
 * Creates a new X509 authentication mechanism
 * @class
 * @extends AuthProvider
 */
class X509 extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  auth(connection, credentials, callback) {
    const username = credentials.username;
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (username) {
      command.user = username;
    }

    connection.command('$external.$cmd', command, callback);
  }
}

module.exports = X509;
