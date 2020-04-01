'use strict';

const Authenticator = require('./authenticator').Authenticator;

/**
 * Creates a new MongoDBX509 authentication mechanism
 * @class
 * @extends Authenticator
 */
class MongoDBX509 extends Authenticator {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, authCtx, callback) {
    if (authCtx.speculativeAuthenticate) {
      return callback(null, authCtx.speculativeAuthenticate);
    }

    const username = credentials.username;
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (username) {
      command.user = username;
    }

    sendAuthCommand(connection, '$external.$cmd', command, callback);
  }

  prepareHandshake(credentials, callback) {
    const username = credentials.username;
    const speculativeAuthenticate = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (username) {
      speculativeAuthenticate.user = username;
    }
    callback(null, speculativeAuthenticate, {});
  }
}

module.exports = { MongoDBX509 };
