'use strict';

const retrieveBSON = require('../connection/utils').retrieveBSON;
const AuthProvider = require('./auth_provider').AuthProvider;

// TODO: can we get the Binary type from this.bson instead?
const BSON = retrieveBSON();
const Binary = BSON.Binary;

/**
 * Creates a new Plain authentication mechanism
 *
 * @extends AuthProvider
 */
class Plain extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
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
