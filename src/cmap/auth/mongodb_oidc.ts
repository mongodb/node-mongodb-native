import type { Document } from 'bson';

import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { HandshakeDocument } from '../connect';
import type { Connection } from '../connection';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsMachineWorkflow } from './mongodb_oidc/aws_machine_workflow';
import { AzureMachineWorkflow } from './mongodb_oidc/azure_machine_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';
import { GCPMachineWorkflow } from './mongodb_oidc/gcp_machine_workflow';
import type { TokenCache } from './mongodb_oidc/token_cache';

/** Error when credentials are missing. */
const MISSING_CREDENTIALS_ERROR = 'AuthContext must provide credentials.';

/**
 * @public
 * @experimental
 */
export interface IdPInfo {
  issuer: string;
  clientId: string;
  requestScopes?: string[];
}

/**
 * @public
 * @experimental
 */
export interface IdPServerResponse {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/**
 * @public
 * @experimental
 */
export interface OIDCResponse {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/**
 * @public
 * @experimental
 */
export interface OIDCCallbackParams {
  timeoutContext: AbortSignal;
  version: number;
  idpInfo?: IdPInfo;
  refreshToken?: string;
}

/**
 * @public
 * @experimental
 */
export type OIDCCallbackFunction = (params: OIDCCallbackParams) => Promise<OIDCResponse>;

type ProviderName = 'aws' | 'azure' | 'gcp' | 'callback';

export interface Workflow {
  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache?: TokenCache,
    response?: Document
  ): Promise<Document>;

  /**
   * Each workflow should specify the correct custom behaviour for reauthentication.
   */
  reauthenticate(
    connection: Connection,
    credentials: MongoCredentials,
    cache?: TokenCache
  ): Promise<Document>;

  /**
   * Get the document to add for speculative authentication.
   */
  speculativeAuth(credentials: MongoCredentials): Promise<Document>;
}

/** @internal */
export const OIDC_WORKFLOWS: Map<ProviderName, Workflow> = new Map();
OIDC_WORKFLOWS.set('callback', new CallbackWorkflow());
OIDC_WORKFLOWS.set('aws', new AwsMachineWorkflow());
OIDC_WORKFLOWS.set('azure', new AzureMachineWorkflow());
OIDC_WORKFLOWS.set('gcp', new GCPMachineWorkflow());

/**
 * OIDC auth provider.
 * @experimental
 */
export class MongoDBOIDC extends AuthProvider {
  cache?: TokenCache;

  /**
   * Instantiate the auth provider.
   */
  constructor(cache?: TokenCache) {
    super();
    this.cache = cache;
  }

  /**
   * Authenticate using OIDC
   */
  override async auth(authContext: AuthContext): Promise<void> {
    const { connection, reauthenticating, response } = authContext;
    const credentials = getCredentials(authContext);
    const workflow = getWorkflow(credentials);
    if (reauthenticating) {
      await workflow.reauthenticate(connection, credentials, this.cache);
    } else {
      await workflow.execute(connection, credentials, this.cache, response);
    }
  }

  /**
   * Add the speculative auth for the initial handshake.
   */
  override async prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext
  ): Promise<HandshakeDocument> {
    const credentials = getCredentials(authContext);
    const workflow = getWorkflow(credentials);
    const result = await workflow.speculativeAuth(credentials);
    return { ...handshakeDoc, ...result };
  }
}

/**
 * Get credentials from the auth context, throwing if they do not exist.
 */
function getCredentials(authContext: AuthContext): MongoCredentials {
  const { credentials } = authContext;
  if (!credentials) {
    throw new MongoMissingCredentialsError(MISSING_CREDENTIALS_ERROR);
  }
  return credentials;
}

/**
 * Gets either a device workflow or callback workflow.
 */
function getWorkflow(credentials: MongoCredentials): Workflow {
  const providerName = credentials.mechanismProperties.ENVIRONMENT;
  const workflow = OIDC_WORKFLOWS.get(providerName || 'callback');
  if (!workflow) {
    throw new MongoInvalidArgumentError(
      `Could not load workflow for provider ${credentials.mechanismProperties.ENVIRONMENT}`
    );
  }
  return workflow;
}
