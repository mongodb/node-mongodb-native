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

/** @internal */
export type OIDCTokenFunction = (credentials: MongoCredentials) => Promise<AccessToken>;

/**
 * Common behaviour for OIDC machine workflows.
 * @internal
 */
export abstract class MachineWorkflow implements Workflow {
  cache: TokenCache;
  callback: OIDCTokenFunction;

  /**
   * Instantiate the machine workflow.
   */
  constructor(cache: TokenCache) {
    this.cache = cache;
    this.callback = this.withLock(this.getToken.bind(this));
  }

  /**
   * Execute the workflow. Gets the token from the subclass implementation.
   */
  async execute(connection: Connection, credentials: MongoCredentials): Promise<void> {
    const token = await this.getTokenFromCacheOrEnv(credentials);
    const command = finishCommandDocument(token);
    await connection.command(ns(credentials.source), command, undefined);
  }

  /**
   * Reauthenticate on a machine workflow just grabs the token again since the server
   * has said the current access token is invalid or expired.
   */
  async reauthenticate(connection: Connection, credentials: MongoCredentials): Promise<void> {
    // Reauthentication implies the token has expired.
    this.cache.removeAccessToken();
    await this.execute(connection, credentials);
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
      const token = await this.callback(credentials);
      this.cache.put({ accessToken: token.access_token, expiresInSeconds: token.expires_in });
      return token.access_token;
    }
  }

  /**
   * Ensure the callback is only executed one at a time.
   */
  private withLock(callback: OIDCTokenFunction) {
    let lock: Promise<any> = Promise.resolve();
    return async (credentials: MongoCredentials): Promise<AccessToken> => {
      await lock;
      // eslint-disable-next-line github/no-then
      lock = lock.then(() => callback(credentials));
      return await lock;
    };
  }

  /**
   * Get the token from the environment or endpoint.
   */
  abstract getToken(credentials: MongoCredentials): Promise<AccessToken>;
}
