'use strict';

const MongoError = require('../error').MongoError;

/**
 * Creates a new AuthProvider, which dictates how to authenticate for a given
 * mechanism.
 * @class
 */
class AuthProvider {
  constructor(bson) {
    this.bson = bson;
    this.authStore = [];
  }

  /**
   * Authenticate
   * @method
   * @param {SendAuthCommand} sendAuthCommand Writes an auth command directly to a specific connection
   * @param {Connection[]} connections Connections to authenticate using this authenticator
   * @param {MongoCredentials} credentials Authentication credentials
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(sendAuthCommand, connections, credentials, callback) {
    // Total connections
    let count = connections.length;

    if (count === 0) {
      callback(null, null);
      return;
    }

    // Valid connections
    let numberOfValidConnections = 0;
    let errorObject = null;

    const execute = connection => {
      this._authenticateSingleConnection(sendAuthCommand, connection, credentials, (err, r) => {
        // Adjust count
        count = count - 1;

        // If we have an error
        if (err) {
          errorObject = new MongoError(err);
        } else if (r && (r.$err || r.errmsg)) {
          errorObject = new MongoError(r);
        } else {
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // Still authenticating against other connections.
        if (count !== 0) {
          return;
        }

        // We have authenticated all connections
        if (numberOfValidConnections > 0) {
          // Store the auth details
          this.addCredentials(credentials);
          // Return correct authentication
          callback(null, true);
        } else {
          if (errorObject == null) {
            errorObject = new MongoError(`failed to authenticate using ${credentials.mechanism}`);
          }
          callback(errorObject, false);
        }
      });
    };

    const executeInNextTick = _connection => process.nextTick(() => execute(_connection));

    // For each connection we need to authenticate
    while (connections.length > 0) {
      executeInNextTick(connections.shift());
    }
  }

  /**
   * Implementation of a single connection authenticating. Is meant to be overridden.
   * Will error if called directly
   * @ignore
   */
  _authenticateSingleConnection(/*sendAuthCommand, connection, credentials, callback*/) {
    throw new Error('_authenticateSingleConnection must be overridden');
  }

  /**
   * Adds credentials to store only if it does not exist
   * @param {MongoCredentials} credentials credentials to add to store
   */
  addCredentials(credentials) {
    const found = this.authStore.some(cred => cred.equals(credentials));

    if (!found) {
      this.authStore.push(credentials);
    }
  }

  /**
   * Re authenticate pool
   * @method
   * @param {SendAuthCommand} sendAuthCommand Writes an auth command directly to a specific connection
   * @param {Connection[]} connections Connections to authenticate using this authenticator
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  reauthenticate(sendAuthCommand, connections, callback) {
    const authStore = this.authStore.slice(0);
    let count = authStore.length;
    if (count === 0) {
      return callback(null, null);
    }

    for (let i = 0; i < authStore.length; i++) {
      this.auth(sendAuthCommand, connections, authStore[i], function(err) {
        count = count - 1;
        if (count === 0) {
          callback(err, null);
        }
      });
    }
  }

  /**
   * Remove credentials that have been previously stored in the auth provider
   * @method
   * @param {string} source Name of database we are removing authStore details about
   * @return {object}
   */
  logout(source) {
    this.authStore = this.authStore.filter(credentials => credentials.source !== source);
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
