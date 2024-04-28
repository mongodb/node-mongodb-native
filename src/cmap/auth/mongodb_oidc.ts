import type { Document } from 'bson';

import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { HandshakeDocument } from '../connect';
import type { Connection } from '../connection';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AutomatedCallbackWorkflow } from './mongodb_oidc/automated_callback_workflow';
import { AzureMachineWorkflow } from './mongodb_oidc/azure_machine_workflow';
import { GCPMachineWorkflow } from './mongodb_oidc/gcp_machine_workflow';
import { HumanCallbackWorkflow } from './mongodb_oidc/human_callback_workflow';
import type { TokenCache } from './mongodb_oidc/token_cache';
import { TokenMachineWorkflow } from './mongodb_oidc/token_machine_workflow';

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

/** The current version of OIDC implementation. */
export const OIDC_VERSION = 1;

type ProviderName = 'test' | 'azure' | 'gcp' | 'automated_callback' | 'human_callback';

export interface Workflow {
  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache,
    response?: Document
  ): Promise<Document>;

  /**
   * Each workflow should specify the correct custom behaviour for reauthentication.
   */
  reauthenticate(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache
  ): Promise<Document>;

  /**
   * Get the document to add for speculative authentication.
   */
  speculativeAuth(credentials: MongoCredentials, cache: TokenCache): Promise<Document>;
}

/** @internal */
export const OIDC_WORKFLOWS: Map<ProviderName, Workflow> = new Map();
OIDC_WORKFLOWS.set('automated_callback', new AutomatedCallbackWorkflow());
OIDC_WORKFLOWS.set('human_callback', new HumanCallbackWorkflow());
OIDC_WORKFLOWS.set('test', new TokenMachineWorkflow());
OIDC_WORKFLOWS.set('azure', new AzureMachineWorkflow());
OIDC_WORKFLOWS.set('gcp', new GCPMachineWorkflow());

/**
 * OIDC auth provider.
 * @experimental
 */
export class MongoDBOIDC extends AuthProvider {
  cache: TokenCache;

  /**
   * Instantiate the auth provider.
   */
  constructor(cache: TokenCache) {
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
    const result = await workflow.speculativeAuth(credentials, this.cache);
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
  let workflow;
  if (credentials.mechanismProperties.OIDC_HUMAN_CALLBACK) {
    workflow = OIDC_WORKFLOWS.get('human_callback');
  } else {
    const providerName = credentials.mechanismProperties.ENVIRONMENT;
    workflow = OIDC_WORKFLOWS.get(providerName || 'automated_callback');
  }
  if (!workflow) {
    throw new MongoInvalidArgumentError(
      `Could not load workflow for provider ${credentials.mechanismProperties.ENVIRONMENT}`
    );
  }
  return workflow;
}
