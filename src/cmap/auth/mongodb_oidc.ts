import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../connect';
import type { Connection } from '../connection';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsDeviceWorkflow } from './mongodb_oidc/aws_device_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';

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

    if (credentials.mechanismProperties.DEVICE_NAME) {
      executeDeviceWorkflow(
        credentials.mechanismProperties.DEVICE_NAME,
        connection,
        credentials,
        callback
      );
    } else {
      new CallbackWorkflow().execute(connection, credentials, callback);
    }
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
 * Authenticates using the device workflow.
 */
function executeDeviceWorkflow(
  deviceName: string,
  connection: Connection,
  credentials: MongoCredentials,
  callback: Callback
): void {
  if (deviceName === 'aws') {
    new AwsDeviceWorkflow().execute(connection, credentials, callback);
  } else {
    callback(
      new MongoInvalidArgumentError(
        'Currently only a DEVICE_NAME of aws is supported for mechanism MONGODB-OIDC.'
      )
    );
  }
}
