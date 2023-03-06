import {
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoRuntimeError
} from '../../error';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../handshake/handshake_generator';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsServiceWorkflow } from './mongodb_oidc/aws_service_workflow';
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

type ProviderName = 'aws' | 'callback';

/** @internal */
export const OIDC_WORKFLOWS: Map<ProviderName, Workflow> = new Map();
OIDC_WORKFLOWS.set('callback', new CallbackWorkflow());
OIDC_WORKFLOWS.set('aws', new AwsServiceWorkflow());

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

    if (response?.speculativeAuthenticate) {
      return callback();
    }

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    try {
      const workflow = getWorkflow(credentials);
      workflow.execute(connection, credentials).then(
        result => {
          return callback(undefined, result);
        },
        error => {
          callback(error);
        }
      );
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Add the speculative auth for the initial handshake.
   */
  override async prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext
  ): Promise<HandshakeDocument> {
    const { credentials } = authContext;

    if (!credentials) {
      throw new MongoMissingCredentialsError('AuthContext must provide credentials.');
    }

    const workflow = getWorkflow(credentials);
    if (!workflow) {
      throw new MongoRuntimeError(
        `Could not load workflow for provider ${credentials.mechanismProperties.PROVIDER_NAME}`
      );
    }
    const result = await workflow.speculativeAuth();
    return { ...handshakeDoc, ...result };
  }
}

/**
 * Gets either a device workflow or callback workflow.
 */
function getWorkflow(credentials: MongoCredentials): Workflow {
  const providerName = credentials.mechanismProperties.PROVIDER_NAME;
  const workflow = OIDC_WORKFLOWS.get(providerName || 'callback');
  if (!workflow) {
    throw new MongoInvalidArgumentError(
      `Could not load workflow for provider ${credentials.mechanismProperties.PROVIDER_NAME}`
    );
  }
  return workflow;
}
