import { type Document } from 'bson';

import { MongoMissingCredentialsError } from '../../../error';
import { type Connection } from '../../connection';
import { type AuthMechanismProperties, type MongoCredentials } from '../mongo_credentials';
import {
  OIDC_VERSION,
  type OIDCCallbackFunction,
  type OIDCCallbackParams,
  type OIDCResponse
} from '../mongodb_oidc';
import { AUTOMATED_TIMEOUT_MS, CallbackWorkflow } from './callback_workflow';
import { type TokenCache } from './token_cache';

const NO_CALLBACK = 'No OIDC_CALLBACK provided for callback workflow.';

/**
 * Class implementing behaviour for the non human callback workflow.
 * @internal
 */
export class AutomatedCallbackWorkflow extends CallbackWorkflow {
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
  async reauthenticate(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache
  ): Promise<Document> {
    // Reauthentication should always remove the access token.
    cache.removeAccessToken();
    return await this.execute(connection, credentials, cache);
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache
  ): Promise<Document> {
    const callback = getCallback(credentials.mechanismProperties);
    // If there is a cached access token, try to authenticate with it. If
    // authentication fails with an Authentication error (18),
    // invalidate the access token, fetch a new access token, and try
    // to authenticate again.
    // If the server fails for any other reason, do not clear the cache.
    if (cache.hasAccessToken) {
      const token = cache.getAccessToken();
      try {
        return await this.finishAuthentication(connection, credentials, token);
      } catch (error) {
        if (error.code === 18) {
          cache.removeAccessToken();
          return await this.execute(connection, credentials, cache);
        } else {
          throw error;
        }
      }
    }
    const response = await this.fetchAccessToken(callback);
    cache.put(response);
    return await this.finishAuthentication(connection, credentials, response.accessToken);
  }

  /**
   * Fetches the access token using the callback.
   */
  protected async fetchAccessToken(callback: OIDCCallbackFunction): Promise<OIDCResponse> {
    const params: OIDCCallbackParams = {
      timeoutContext: AbortSignal.timeout(AUTOMATED_TIMEOUT_MS),
      version: OIDC_VERSION
    };
    return await this.executeAndValidateCallback(callback, params);
  }
}

/**
 * Returns the callback from the mechanism properties.
 */
export function getCallback(mechanismProperties: AuthMechanismProperties): OIDCCallbackFunction {
  if (mechanismProperties.OIDC_CALLBACK) {
    return mechanismProperties.OIDC_CALLBACK;
  }
  throw new MongoMissingCredentialsError(NO_CALLBACK);
}
