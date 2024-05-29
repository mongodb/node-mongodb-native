import type { Document } from 'bson';

import { MongoDriverError, MongoMissingCredentialsError } from '../../error';
import type { HandshakeDocument } from '../connect';
import type { Connection } from '../connection';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AzureMachineWorkflow } from './mongodb_oidc/azure_machine_workflow';
import { GCPMachineWorkflow } from './mongodb_oidc/gcp_machine_workflow';
import { TokenCache } from './mongodb_oidc/token_cache';
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

type EnvironmentName = 'test' | 'azure' | 'gcp' | undefined;

/** @internal */
export interface Workflow {
  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  execute(
    connection: Connection,
    credentials: MongoCredentials,
    response?: Document
  ): Promise<Document>;

  /**
   * Each workflow should specify the correct custom behaviour for reauthentication.
   */
  reauthenticate(connection: Connection, credentials: MongoCredentials): Promise<Document>;

  /**
   * Get the document to add for speculative authentication.
   */
  speculativeAuth(credentials: MongoCredentials): Promise<Document>;
}

/** @internal */
export const OIDC_WORKFLOWS: Map<EnvironmentName, () => Workflow> = new Map();
OIDC_WORKFLOWS.set('test', () => new TokenMachineWorkflow(new TokenCache()));
OIDC_WORKFLOWS.set('azure', () => new AzureMachineWorkflow(new TokenCache()));
OIDC_WORKFLOWS.set('gcp', () => new GCPMachineWorkflow(new TokenCache()));

/**
 * OIDC auth provider.
 * @experimental
 */
export class MongoDBOIDC extends AuthProvider {
  workflow: Workflow;

  /**
   * Instantiate the auth provider.
   */
  constructor(workflow?: Workflow) {
    super();
    if (!workflow) {
      throw new MongoDriverError('');
    }
    this.workflow = workflow;
  }

  /**
   * Authenticate using OIDC
   */
  override async auth(authContext: AuthContext): Promise<void> {
    const { connection, reauthenticating, response } = authContext;
    const credentials = getCredentials(authContext);
    if (reauthenticating) {
      await this.workflow.reauthenticate(connection, credentials);
    } else {
      await this.workflow.execute(connection, credentials, response);
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
    const result = await this.workflow.speculativeAuth(credentials);
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
