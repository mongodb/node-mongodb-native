import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../connect';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsDeviceWorkflow } from './mongodb_oidc/aws_device_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';
import type { Workflow } from './mongodb_oidc/workflow';

/** @public */
export interface OIDCMechanismServerStep1 {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
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
  serverResult: OIDCMechanismServerStep1,
  timeout: AbortSignal | number
) => Promise<OIDCRequestTokenResult>;

/** @public */
export type OIDCRefreshFunction = (
  principalName: string,
  serverResult: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult,
  timeout: AbortSignal | number
) => Promise<OIDCRequestTokenResult>;

/** @internal */
export const OIDC_WORKFLOWS = {
  callback: new CallbackWorkflow(),
  aws: new AwsDeviceWorkflow(),
  azure: undefined,
  gcp: undefined,
  __proto__: null
};

/**
 * OIDC auth provider.
 */
export class MongoDBOIDC extends AuthProvider {
  /**
   * Instantiate the auth provider.
   */
  constructor() {
    super();
  }

  /**
   * Authenticate using OIDC
   */
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials, response } = authContext;

    if (response && response.speculativeAuthenticate) {
      return callback();
    }

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    getWorkflow(credentials, (error, workflow) => {
      if (error || !workflow) {
        return callback(error);
      }
      workflow
        .execute(connection, credentials)
        .then(result => {
          return callback(undefined, result);
        })
        .catch(error => {
          callback(error);
        });
    });
  }

  /**
   * Add the speculative auth for the initial handshake.
   */
  override prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback<HandshakeDocument>
  ): void {
    const { credentials } = authContext;

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    getWorkflow(credentials, (error, workflow) => {
      if (error || !workflow) {
        return callback(error);
      }
      workflow
        .speculativeAuth()
        .then(result => {
          return callback(undefined, { ...handshakeDoc, ...result });
        })
        .catch(error => {
          callback(error);
        });
    });
  }
}

/**
 * Gets either a device workflow or callback workflow.
 */
function getWorkflow(credentials: MongoCredentials, callback: Callback<Workflow>): void {
  const deviceName = credentials.mechanismProperties.DEVICE_NAME;
  const workflow = OIDC_WORKFLOWS[deviceName || 'callback'];
  if (!workflow) {
    return callback(
      new MongoInvalidArgumentError(
        `Could not load workflow for device ${credentials.mechanismProperties.DEVICE_NAME}`
      )
    );
  }
  callback(undefined, workflow);
}
