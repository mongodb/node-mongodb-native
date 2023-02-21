import { readFile } from 'node:fs/promises';

import { type Document, BSON } from 'bson';

import { MongoMissingCredentialsError } from '../../error';
import { type Callback, ns } from '../../utils';
import type { HandshakeDocument } from '../connect';
import type { Connection } from '../connection';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AuthMechanism } from './providers';

/** @public */
export interface OIDCMechanismServerStep1 {
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizeEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/** @public */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/** @public */
export type OIDCRequestFunction = (
  principalName: string,
  idl: OIDCMechanismServerStep1,
  timeout: AbortSignal
) => Promise<OIDCRequestTokenResult>;

/** @public */
export type OIDCRefreshFunction = (
  principalName: string,
  idl: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult,
  timeout: AbortSignal
) => Promise<OIDCRequestTokenResult>;

/** @internal */
const kCache = Symbol('cache');

export class MongoDBOIDC extends AuthProvider {
  /** @internal */
  [kCache]: Map<string, OIDCMechanismServerStep1>;

  /**
   * Instantiate the auth provider.
   */
  constructor() {
    super();
    this[kCache] = new Map();
  }

  /**
   * Authenticate using OIDC
   */
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    saslStart(connection, credentials, (error, result) => {
      if (error) {
        return callback(error);
      }
      if (!result) {
        return callback(
          new MongoMissingCredentialsError('No result token returned from saslStart')
        );
      }
      saslContinue(connection, credentials, result, (continueError, continueResult) => {
        if (continueError) {
          return callback(continueError);
        }
        callback(undefined, continueResult);
      });
    });
  }

  /**
   * Add the specualtive auth for the initial handshake.
   */
  override prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback<HandshakeDocument>
  ): void {
    callback(undefined, handshakeDoc);
  }

  /**
   * Clear the token cache.
   */
  clearCache(): void {
    this[kCache].clear();
  }
}

/**
 * Execute the saslStart command.
 */
function saslStart(
  connection: Connection,
  credentials: MongoCredentials,
  callback: Callback<OIDCMechanismServerStep1>
): void {
  // TODO: We can skip saslStart if we have a DEVICE_NAME or a cached token.
  const command = saslStartCommand(credentials);
  connection.command(ns(credentials.source), command, undefined, (error, result) => {
    if (error) {
      return callback(error);
    }
    console.log('saslStart result', result);
    callback(undefined, { clientId: '' });
  });
}

/**
 * Execute the saslContinue command.
 */
function saslContinue(
  connection: Connection,
  credentials: MongoCredentials,
  result: OIDCMechanismServerStep1,
  callback: Callback<OIDCRequestTokenResult>
): void {
  const command = saslContinueCommand(1, 'test');
  connection.command(ns(credentials.source), command, undefined, (error, commandResult) => {
    if (error) {
      return callback(error);
    }
    console.log('saslContinue result', commandResult);
    callback(undefined, { accessToken: '' });
  });
}

/**
 * Generate the saslStart command document.
 */
function saslStartCommand(credentials: MongoCredentials): Document {
  const payload: Document = {};
  if (credentials.username) {
    payload.n = credentials.username;
  }
  return {
    saslStart: 1,
    autoAuthorize: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: BSON.serialize(payload)
  };
}

/**
 * Generate the saslContinue command document.
 */
function saslContinueCommand(conversationId: number, token: string): Document {
  return {
    saslContinue: 1,
    conversationId: conversationId,
    payload: BSON.serialize({ jwt: token })
  };
}
