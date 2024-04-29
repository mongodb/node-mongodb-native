import { type Document } from 'bson';
import { setTimeout } from 'timers/promises';

import { type Connection } from '../../connection';
import { type MongoCredentials } from '../mongo_credentials';
import {
  OIDC_VERSION,
  type OIDCCallbackFunction,
  type OIDCCallbackParams,
  type OIDCResponse
} from '../mongodb_oidc';
import { AUTOMATED_TIMEOUT_MS, CallbackWorkflow } from './callback_workflow';
import { type TokenCache } from './token_cache';

/** Must wait at least 100ms between invokations */
const CALLBACK_DELAY = 100;

/**
 * Class implementing behaviour for the non human callback workflow.
 * @internal
 */
export class AutomatedCallbackWorkflow extends CallbackWorkflow {
  private lastInvokationTime: number;

  /**
   * Instantiate the human callback workflow.
   */
  constructor(cache: TokenCache, callback: OIDCCallbackFunction) {
    super(cache, callback);
    this.lastInvokationTime = Date.now();
  }

  /**
   * Reauthenticate the callback workflow.
   * For reauthentication:
   * - Check if the connection's accessToken is not equal to the token manager's.
   *   - If they are different, use the token from the manager and set it on the connection and finish auth.
   *     - On success return, on error continue.
   * - start auth to update the IDP information
   *   - If the idp info has changed, clear access token and refresh token.
   *   - If the idp info has not changed, attempt to use the refresh token.
   * - if there's still a refresh token at this point, attempt to finish auth with that.
   * - Attempt the full auth run, on error, raise to user.
   */
  async reauthenticate(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    // Reauthentication should always remove the access token.
    this.cache.removeAccessToken();
    return await this.execute(connection, credentials);
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    // If there is a cached access token, try to authenticate with it. If
    // authentication fails with an Authentication error (18),
    // invalidate the access token, fetch a new access token, and try
    // to authenticate again.
    // If the server fails for any other reason, do not clear the cache.
    if (this.cache.hasAccessToken) {
      const token = this.cache.getAccessToken();
      try {
        return await this.finishAuthentication(connection, credentials, token);
      } catch (error) {
        if (error.code === 18) {
          this.cache.removeAccessToken();
          return await this.execute(connection, credentials);
        } else {
          throw error;
        }
      }
    }
    let response: OIDCResponse;
    const now = Date.now();
    // Ensure a delay between invokations to not overload the callback.
    if (now - this.lastInvokationTime > CALLBACK_DELAY) {
      response = await this.fetchAccessToken();
    } else {
      const responses = await Promise.all([
        setTimeout(CALLBACK_DELAY - (now - this.lastInvokationTime)),
        this.fetchAccessToken()
      ]);
      response = responses[1];
    }
    this.lastInvokationTime = now;
    this.cache.put(response);
    return await this.finishAuthentication(connection, credentials, response.accessToken);
  }

  /**
   * Fetches the access token using the callback.
   */
  protected async fetchAccessToken(): Promise<OIDCResponse> {
    const params: OIDCCallbackParams = {
      timeoutContext: AbortSignal.timeout(AUTOMATED_TIMEOUT_MS),
      version: OIDC_VERSION
    };
    return await this.executeAndValidateCallback(params);
  }
}
