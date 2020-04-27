'use strict';

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
   * Authenticate
   *
   * @param {AuthContext} context A shared context for authentication flow
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(context, callback) {
    callback(new Error('`auth` method must be overridden by subclass'));
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
