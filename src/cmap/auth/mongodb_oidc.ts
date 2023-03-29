import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { HandshakeDocument } from '../connect';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsServiceWorkflow } from './mongodb_oidc/aws_service_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';
import type { Workflow } from './mongodb_oidc/workflow';

/**
 * @public
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
 * @public
 * @experimental
 */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/**
 * @public
 * @experimental
 */
export type OIDCRequestFunction = (
  principalName: string,
  serverResult: OIDCMechanismServerStep1,
  timeout: AbortSignal | number
) => Promise<OIDCRequestTokenResult>;

/**
 * @public
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
  override async auth(authContext: AuthContext): Promise<void> {
    const { connection, credentials, response, reauthenticating } = authContext;

    if (response?.speculativeAuthenticate) {
      return;
    }

    if (!credentials) {
      throw new MongoMissingCredentialsError('AuthContext must provide credentials.');
    }

    const workflow = getWorkflow(credentials);

    await workflow.execute(connection, credentials, reauthenticating);
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
