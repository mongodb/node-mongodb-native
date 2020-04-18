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
   * @param {SendAuthCommand} sendAuthCommand Writes an auth command directly to a specific connection
   * @param {Connection[]} connections Connections to authenticate using this authenticator
   * @param {MongoCredentials} credentials Authentication credentials
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(/* sendAuthCommand, connection, credentials, callback */) {
    throw new Error('`auth` method must be overridden by subclass');
  }
}

/**
 * A function that writes authentication commands to a specific connection
 * @callback SendAuthCommand
 * @param {Connection} connection The connection to write to
 * @param {Command} command A command with a toBin method that can be written to a connection
 * @param {AuthWriteCallback} callback Callback called when command response is received
 */

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
