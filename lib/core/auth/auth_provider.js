'use strict';

/**
 * Creates a new AuthProvider, which dictates how to authenticate for a given
 * mechanism.
 * @class
 */
class AuthProvider {
  constructor(bson) {
    this.bson = bson;
  }

  /**
   * Authenticate
   * @method
   * @param {Connection} connection The connection to authenticate
   * @param {MongoCredentials} credentials Authentication credentials
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(/* connection, credentials, callback */) {
    throw new Error('`auth` method must be overridden by subclass');
  }
}

/**
 * A callback for a specific auth command
 * @callback AuthWriteCallback
 * @param {Error} err If command failed, an error from the server
 * @param {object} r The response from the server
 */

/**
 * This is a result from an authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = { AuthProvider };
