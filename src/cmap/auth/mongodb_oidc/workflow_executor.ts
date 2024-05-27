import { MongoOIDCError } from '../../../error';
import type { MongoCredentials } from '../mongo_credentials';
import { type OIDCResponse } from '../mongodb_oidc';
import type { RequestAccessTokenFunction } from './callback_workflow';

/* The no response error message. */
const NO_RESPONSE = 'No OIDC response found even though the workflow has been executed.';

/**
 * Executes workflow functions that return OIDC responses, throttling/debouncing
 * for the provided debounceMS time.
 * @internal
 */
export class WorkflowExecutor {
  debounceMS: number;
  lastExecutionTime: number;
  oidcResponse?: OIDCResponse;

  constructor(debounceMS: number) {
    this.debounceMS = debounceMS;
    this.lastExecutionTime = Date.now() - debounceMS;
  }

  /**
   * Execute the function.
   */
  async execute(
    fn: RequestAccessTokenFunction,
    credentials: MongoCredentials
  ): Promise<OIDCResponse> {
    // If we have passed debounceMS since the last execution time, execute the
    // function, set the last execution time, and set the last execution value.
    if (Date.now() - this.lastExecutionTime > this.debounceMS) {
      this.oidcResponse = await fn(credentials);
      this.lastExecutionTime = Date.now();
    }
    // If there's no response and we haven't thrown already, throw now.
    if (!this.oidcResponse) {
      throw new MongoOIDCError(NO_RESPONSE);
    }
    return this.oidcResponse;
  }
}
