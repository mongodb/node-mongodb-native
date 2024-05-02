import { type Document } from 'bson';

import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type { Workflow } from '../mongodb_oidc';
import { finishCommandDocument } from './command_builders';
import { type TokenCache } from './token_cache';

/**
 * The access token format.
 * @internal
 */
export interface AccessToken {
  access_token: string;
  expires_in?: number;
}

/**
 * Common behaviour for OIDC machine workflows.
 * @internal
 */
export abstract class MachineWorkflow implements Workflow {
  cache: TokenCache;

  /**
   * Instantiate the machine workflow.
   */
  constructor(cache: TokenCache) {
    this.cache = cache;
  }

  /**
   * Execute the workflow. Gets the token from the subclass implementation.
   */
  async execute(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    const token = await this.getTokenFromCacheOrEnv(credentials);
    const command = finishCommandDocument(token);
    return await connection.command(ns(credentials.source), command, undefined);
  }

  /**
   * Reauthenticate on a machine workflow just grabs the token again since the server
   * has said the current access token is invalid or expired.
   */
  async reauthenticate(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    // Reauthentication implies the token has expired.
    this.cache.removeAccessToken();
    return await this.execute(connection, credentials);
  }

  /**
   * Get the document to add for speculative authentication.
   */
  async speculativeAuth(credentials: MongoCredentials): Promise<Document> {
    // The spec states only cached access tokens can use speculative auth.
    if (!this.cache.hasAccessToken) {
      return {};
    }
    const token = await this.getTokenFromCacheOrEnv(credentials);
    const document = finishCommandDocument(token);
    document.db = credentials.source;
    return { speculativeAuthenticate: document };
  }

  /**
   * Get the token from the cache or environment.
   */
  private async getTokenFromCacheOrEnv(credentials: MongoCredentials): Promise<string> {
    if (this.cache.hasAccessToken) {
      return this.cache.getAccessToken();
    } else {
      const token = await this.getToken(credentials);
      this.cache.put({ accessToken: token.access_token, expiresInSeconds: token.expires_in });
      return token.access_token;
    }
  }

  /**
   * Get the token from the environment or endpoint.
   */
  abstract getToken(credentials: MongoCredentials): Promise<AccessToken>;
}
