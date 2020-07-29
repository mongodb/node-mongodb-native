import type { Callback, Document } from '../../types';
import type { Connection, MongoDBConnectionOptions } from '../connection';
import type { MongoCredentials } from './mongo_credentials';
import type { HandshakeDocument } from '../connect';
import type { ClientMetadataOptions } from '../../utils';

export type AuthContextOptions = MongoDBConnectionOptions & ClientMetadataOptions;

/**
 * Context used during authentication
 *
 * @property {Connection} connection The connection to authenticate
 * @property {MongoCredentials} credentials The credentials to use for authentication
 * @property {ConnectionOptions} options The options passed to the `connect` method
 * @property {object?} response The response of the initial handshake
 * @property {Buffer?} nonce A random nonce generated for use in an authentication conversation
 */
export class AuthContext {
  connection: Connection;
  credentials!: MongoCredentials;
  options: AuthContextOptions;

  /** A response from a speculative auth attempt, only some mechanisms use this (e.g, SCRAM) */
  response?: Document;
  nonce?: Buffer;

  constructor(
    connection: Connection,
    credentials: MongoCredentials | undefined,
    options: AuthContextOptions
  ) {
    this.connection = connection;
    this.credentials = credentials!;
    this.options = options;
  }
}

export class AuthProvider {
  /**
   * Prepare the handshake document before the initial handshake.
   *
   * @param {object} handshakeDoc The document used for the initial handshake on a connection
   * @param {AuthContext} authContext Context for authentication flow
   * @param {Function} callback
   */
  prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback<HandshakeDocument>
  ): void {
    callback(undefined, handshakeDoc);
  }

  /**
   * Authenticate
   *
   * @param {AuthContext} context A shared context for authentication flow
   * @param {authResultCallback} callback The callback to return the result from the authentication
   */
  auth(context: AuthContext, callback: Callback): void {
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
