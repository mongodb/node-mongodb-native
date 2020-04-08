'use strict';

const { BSON } = require('../../deps');
const { Binary } = BSON;
const AuthProvider = require('./auth_provider').AuthProvider;

/**
 * Creates a new Plain authentication mechanism
 *
 * @extends AuthProvider
 */
class Plain extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   *
   * @override
   */
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, callback) {
    const username = credentials.username;
    const password = credentials.password;
    const payload = new Binary(`\x00${username}\x00${password}`);
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    sendAuthCommand(connection, '$external.$cmd', command, callback);
  }
}

module.exports = Plain;
