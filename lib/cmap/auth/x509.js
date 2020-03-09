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
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, callback) {
    const username = credentials.username;
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (username) {
      command.user = username;
    }

    sendAuthCommand(connection, '$external.$cmd', command, callback);
  }
}

module.exports = X509;
