import { readFile } from 'node:fs/promises';

import { type Document, BSON } from 'bson';

import { MongoMissingCredentialsError } from '../../error';
import type { Callback } from '../../utils';
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
  idl: OIDCMechanismServerStep1
) => Promise<OIDCRequestTokenResult>;

/** @public */
export type OIDCRefreshFunction = (
  idl: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult
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

    saslStart(connection, credentials)
      .then(result => {
        return saslContinue(connection, credentials, result);
      })
      .then(result => {
        callback(undefined, result);
      })
      .catch(error => {
        callback(error);
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
async function saslStart(
  connection: Connection,
  credentials: MongoCredentials
): Promise<OIDCMechanismServerStep1> {
  // TODO: We can skip saslStart if we have a DEVICE_NAME or a cached token.
  const command = saslStartCommand(credentials);
  const result = await connection.command(credentials.source, command, undefined);
  console.log('saslStart result', result);
  return { clientId: '' };
}

/**
 * Execute the saslContinue command.
 */
async function saslContinue(
  connection: Connection,
  credentials: MongoCredentials,
  result: OIDCMechanismServerStep1
): Promise<OIDCRequestTokenResult> {
  const command = saslContinueCommand(1, 'test');
  const commandResult = await connection.command(credentials.source, command, undefined);
  console.log('saslContinue result', commandResult);
  return { accessToken: '' };
}

/**
 * Generate the saslStart command document.
 */
function saslStartCommand(credentials: MongoCredentials): Document {
  const payload: Document = {};
  if (credentials.username || credentials.mechanismProperties.PRINCIPAL_NAME) {
    payload.n = credentials.username || credentials.mechanismProperties.PRINCIPAL_NAME;
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
