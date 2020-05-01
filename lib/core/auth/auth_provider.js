'use strict';

/**
 * Context used during authentication
 *
 * @property {Connection} connection The connection to authenticate
 * @property {MongoCredentials} credentials The credentials to use for authentication
 * @property {object} options The options passed to the `connect` method
 * @property {object?} response The response of the initial handshake
 * @property {Buffer?} nonce A random nonce generated for use in an authentication conversation
 */
class AuthContext {
  constructor(connection, credentials, options) {
    this.connection = connection;
    this.credentials = credentials;
    this.options = options;
  }
}

class AuthProvider {
  constructor(bson) {
    this.bson = bson;
  }

  /**
   * Prepare the handshake document before the initial handshake.
   *
   * @param {object} handshakeDoc The document used for the initial handshake on a connection
   * @param {AuthContext} authContext Context for authentication flow
   * @param {function} callback
   */
  prepare(handshakeDoc, context, callback) {
    callback(undefined, handshakeDoc);
  }

  /**
   * Authenticate
   *
   * @param {AuthContext} context A shared context for authentication flow
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(context, callback) {
    callback(new TypeError('`auth` method must be overridden by subclass'));
  }
}

/**
 * This is a result from an authentication provider
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = { AuthContext, AuthProvider };
