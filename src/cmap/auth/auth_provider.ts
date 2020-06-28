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
  connection: any;
  credentials: any;
  options: any;

  constructor(connection: any, credentials: any, options: any) {
    this.connection = connection;
    this.credentials = credentials;
    this.options = options;
  }
}

class AuthProvider {
  /**
   * Prepare the handshake document before the initial handshake.
   *
   * @param {object} handshakeDoc The document used for the initial handshake on a connection
   * @param {AuthContext} authContext Context for authentication flow
   * @param {Function} callback
   */
  prepare(handshakeDoc: object, authContext: AuthContext, callback: Function) {
    callback(undefined, handshakeDoc);
  }

  /**
   * Authenticate
   *
   * @param {AuthContext} context A shared context for authentication flow
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(context: AuthContext, callback: any) {
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

export { AuthContext, AuthProvider };
