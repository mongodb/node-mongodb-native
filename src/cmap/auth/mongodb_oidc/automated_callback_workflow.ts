import { type Document } from 'bson';

import { MongoMissingCredentialsError } from '../../../error';
import { type Connection } from '../../connection';
import { type AuthMechanismProperties, type MongoCredentials } from '../mongo_credentials';
import { type OIDCCallbackFunction } from '../mongodb_oidc';
import { CallbackWorkflow } from './callback_workflow';
import { type TokenCache, type TokenEntry } from './token_cache';

const NO_CALLBACK = 'No OIDC_CALLBACK provided for callback workflow.';

/**
 * Class implementing behaviour for the non human callback workflow.
 * @internal
 */
export class AutomatedCallbackWorkflow extends CallbackWorkflow {
  /**
   * Execute the OIDC callback workflow.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache?: TokenCache
  ): Promise<Document> {
    const callback = getCallback(credentials.mechanismProperties);
    // If there is a cached access token, try to authenticate with it. If
    // authentication fails with an Authentication error (18),
    // invalidate the access token, fetch a new access token, and try
    // to authenticate again.
    // If the server fails for any other reason, do not clear the cache.
    let tokenEntry: TokenEntry;
    if (cache?.hasToken()) {
      tokenEntry = cache.get();
      console.log(tokenEntry);
      try {
        return await this.finishAuthentication(
          connection,
          credentials,
          tokenEntry.idpServerResponse
        );
      } catch (error) {
        console.log(error);
        if (error.code === 18) {
          cache?.remove();
          return await this.oneStepAuth(connection, credentials, callback, cache);
        } else {
          throw error;
        }
      }
    }
    console.log('no token, one step');
    return await this.oneStepAuth(connection, credentials, callback, cache);
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
