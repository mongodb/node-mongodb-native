import {
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoRuntimeError
} from '../../error';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../connect';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsServiceWorkflow } from './mongodb_oidc/aws_service_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';
import type { Workflow } from './mongodb_oidc/workflow';

/**
 * @alpha
 * @experimental
 */
export interface OIDCMechanismServerStep1 {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/**
 * @alpha
 * @experimental
 */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/**
 * @alpha
 * @experimental
 */
export type OIDCRequestFunction = (
  principalName: string,
  serverResult: OIDCMechanismServerStep1,
  timeout: AbortSignal | number
) => Promise<OIDCRequestTokenResult>;

/**
 * @alpha
 * @experimental
 */
export type OIDCRefreshFunction = (
  principalName: string,
  serverResult: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult,
  timeout: AbortSignal | number
) => Promise<OIDCRequestTokenResult>;

type ProviderName = 'aws' | 'callback';

/** @internal */
export const OIDC_WORKFLOWS: Map<ProviderName, Workflow> = new Map();
OIDC_WORKFLOWS.set('callback', new CallbackWorkflow());
OIDC_WORKFLOWS.set('aws', new AwsServiceWorkflow());

/**
 * OIDC auth provider.
 * @experimental
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
    const { connection, credentials, response, reauthenticating } = authContext;

    if (response?.speculativeAuthenticate) {
      return callback();
    }

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    getWorkflow(credentials, (error, workflow) => {
      if (error) {
        return callback(error);
      }
      if (!workflow) {
        return callback(
          new MongoRuntimeError(
            `Could not load workflow for device ${credentials.mechanismProperties.PROVIDER_NAME}`
          )
        );
      }
      workflow.execute(connection, credentials, reauthenticating).then(
        result => {
          return callback(undefined, result);
        },
        error => {
          callback(error);
        }
      );
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
      if (error) {
        return callback(error);
      }
      if (!workflow) {
        return callback(
          new MongoRuntimeError(
            `Could not load workflow for provider ${credentials.mechanismProperties.PROVIDER_NAME}`
          )
        );
      }
      workflow.speculativeAuth().then(
        result => {
          return callback(undefined, { ...handshakeDoc, ...result });
        },
        error => {
          callback(error);
        }
      );
    });
  }
}

/**
 * Gets either a device workflow or callback workflow.
 */
function getWorkflow(credentials: MongoCredentials, callback: Callback<Workflow>): void {
  const providerName = credentials.mechanismProperties.PROVIDER_NAME;
  const workflow = OIDC_WORKFLOWS.get(providerName || 'callback');
  if (!workflow) {
    return callback(
      new MongoInvalidArgumentError(
        `Could not load workflow for provider ${credentials.mechanismProperties.PROVIDER_NAME}`
      )
    );
  }
  callback(undefined, workflow);
}
