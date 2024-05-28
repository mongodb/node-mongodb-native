import { type Document } from 'bson';
import { setTimeout } from 'timers';

import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type { Workflow } from '../mongodb_oidc';
import { finishCommandDocument } from './command_builders';
import { type TokenCache } from './token_cache';

/** The time to throttle callback calls. */
const THROTTLE_MS = 100;

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
  lastExecutionTime: number;

  /**
   * Instantiate the machine workflow.
   */
  constructor(cache: TokenCache) {
    this.cache = cache;
    this.callback = this.withLock(this.getToken.bind(this));
    this.lastExecutionTime = Date.now() - THROTTLE_MS;
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
   * Ensure the callback is only executed one at a time, and throttled to
   * only once per 100ms.
   */
  private withLock(callback: OIDCTokenFunction): OIDCTokenFunction {
    let lock: Promise<any> = Promise.resolve();
    return async (credentials: MongoCredentials): Promise<AccessToken> => {
      // We do this to ensure that we would never return the result of the
      // previous lock, only the current callback's value would get returned.
      await lock;
      // eslint-disable-next-line github/no-then
      lock = lock.then(async () => {
        let result;
        const difference = Date.now() - this.lastExecutionTime;
        if (difference > THROTTLE_MS) {
          result = await callback(credentials);
        } else {
          result = await new Promise(resolve => {
            setTimeout(() => {
              this.lastExecutionTime = Date.now();
              resolve(callback(credentials));
            }, THROTTLE_MS - difference);
          });
        }
        return result;
      });
      return await lock;
    };
  }

  /**
   * Get the token from the environment or endpoint.
   */
  abstract getToken(credentials: MongoCredentials): Promise<AccessToken>;
}
