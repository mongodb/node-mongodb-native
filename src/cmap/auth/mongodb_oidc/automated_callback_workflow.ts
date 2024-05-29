import { setTimeout } from 'timers/promises';

import { MONGODB_ERROR_CODES, MongoError } from '../../../error';
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

/** Must wait at least 100ms between invocations */
const CALLBACK_DEBOUNCE_MS = 100;

/**
 * Class implementing behaviour for the non human callback workflow.
 * @internal
 */
export class AutomatedCallbackWorkflow extends CallbackWorkflow {
  private lastInvocationTime: number;

  /**
   * Instantiate the human callback workflow.
   */
  constructor(cache: TokenCache, callback: OIDCCallbackFunction) {
    super(cache, callback);
    this.lastInvocationTime = Date.now();
  }

  /**
   * Reauthenticate the callback workflow. For this we invalidated the access token
   * in the cache and run the authentication steps again. No initial handshake needs
   * to be sent.
   */
  async reauthenticate(connection: Connection, credentials: MongoCredentials): Promise<void> {
    // Reauthentication should always remove the access token.
    this.cache.removeAccessToken();
    await this.execute(connection, credentials);
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(connection: Connection, credentials: MongoCredentials): Promise<void> {
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
        if (
          error instanceof MongoError &&
          error.code === MONGODB_ERROR_CODES.AuthenticationFailed
        ) {
          this.cache.removeAccessToken();
          return await this.execute(connection, credentials);
        } else {
          throw error;
        }
      }
    }
    let response: OIDCResponse;
    const now = Date.now();
    if (now - this.lastInvocationTime > CALLBACK_DEBOUNCE_MS) {
      response = await this.fetchAccessToken(credentials);
    } else {
      // Ensure a delay between invokations to not overload the callback.
      const responses = await Promise.all([
        setTimeout(CALLBACK_DEBOUNCE_MS - (now - this.lastInvocationTime)),
        this.fetchAccessToken(credentials)
      ]);
      response = responses[1];
    }
    this.lastInvocationTime = now;
    this.cache.put(response);
    await this.finishAuthentication(connection, credentials, response.accessToken);
  }

  /**
   * Fetches the access token using the callback.
   */
  protected async fetchAccessToken(credentials: MongoCredentials): Promise<OIDCResponse> {
    const params: OIDCCallbackParams = {
      timeoutContext: AbortSignal.timeout(AUTOMATED_TIMEOUT_MS),
      version: OIDC_VERSION
    };
    if (credentials.username) {
      params.username = credentials.username;
    }
    return await this.executeAndValidateCallback(params);
  }
}
