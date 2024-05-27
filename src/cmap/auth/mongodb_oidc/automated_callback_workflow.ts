import { MONGODB_ERROR_CODES, MongoError, MongoOIDCError } from '../../../error';
import { Timeout, TimeoutError } from '../../../timeout';
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
import { WorkflowExecutor } from './workflow_executor';

/** Must wait at least 100ms between invocations */
const CALLBACK_DEBOUNCE_MS = 100;

/**
 * Class implementing behaviour for the non human callback workflow.
 * @internal
 */
export class AutomatedCallbackWorkflow extends CallbackWorkflow {
  private workflowExecutor: WorkflowExecutor;

  /**
   * Instantiate the human callback workflow.
   */
  constructor(cache: TokenCache, callback: OIDCCallbackFunction) {
    super(cache, callback);
    this.workflowExecutor = new WorkflowExecutor(CALLBACK_DEBOUNCE_MS);
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
    const response = await this.workflowExecutor.execute(
      this.fetchAccessToken.bind(this),
      credentials
    );
    this.cache.put(response);
    await this.finishAuthentication(connection, credentials, response.accessToken);
  }

  /**
   * Fetches the access token using the callback.
   */
  protected async fetchAccessToken(credentials: MongoCredentials): Promise<OIDCResponse> {
    const controller = new AbortController();
    const params: OIDCCallbackParams = {
      timeoutContext: controller.signal,
      version: OIDC_VERSION
    };
    if (credentials.username) {
      params.username = credentials.username;
    }
    const timeout = Timeout.expires(AUTOMATED_TIMEOUT_MS);
    try {
      return await Promise.race([this.executeAndValidateCallback(params), timeout]);
    } catch (error) {
      if (TimeoutError.is(error)) {
        controller.abort();
        throw new MongoOIDCError(`OIDC callback timed out after ${AUTOMATED_TIMEOUT_MS}ms.`);
      }
      throw error;
    } finally {
      timeout.clear();
    }
  }
}
