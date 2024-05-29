import { type Document } from 'bson';

import { MongoMissingCredentialsError } from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import {
  type OIDCCallbackFunction,
  type OIDCCallbackParams,
  type OIDCResponse,
  type Workflow
} from '../mongodb_oidc';
import { finishCommandDocument, startCommandDocument } from './command_builders';
import type { TokenCache } from './token_cache';

/** 5 minutes in milliseconds */
export const HUMAN_TIMEOUT_MS = 300000;
/** 1 minute in milliseconds */
export const AUTOMATED_TIMEOUT_MS = 60000;

/** Properties allowed on results of callbacks. */
const RESULT_PROPERTIES = ['accessToken', 'expiresInSeconds', 'refreshToken'];

/** Error message when the callback result is invalid. */
const CALLBACK_RESULT_ERROR =
  'User provided OIDC callbacks must return a valid object with an accessToken.';

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export abstract class CallbackWorkflow implements Workflow {
  /**
   * Get the document to add for speculative authentication. This also needs
   * to add a db field from the credentials source.
   */
  async speculativeAuth(credentials: MongoCredentials): Promise<Document> {
    const document = startCommandDocument(credentials);
    document.db = credentials.source;
    return { speculativeAuthenticate: document };
  }

  /**
   * Each workflow should specify the correct custom behaviour for reauthentication.
   */
  abstract reauthenticate(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache
  ): Promise<Document>;

  /**
   * Execute the OIDC callback workflow.
   */
  abstract execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache: TokenCache,
    response?: Document
  ): Promise<Document>;

  /**
   * Starts the callback authentication process. If there is a speculative
   * authentication document from the initial handshake, then we will use that
   * value to get the issuer, otherwise we will send the saslStart command.
   */
  protected async startAuthentication(
    connection: Connection,
    credentials: MongoCredentials,
    response?: Document
  ): Promise<Document> {
    let result;
    if (response?.speculativeAuthenticate) {
      result = response.speculativeAuthenticate;
    } else {
      result = await connection.command(
        ns(credentials.source),
        startCommandDocument(credentials),
        undefined
      );
    }
    return result;
  }

  /**
   * Finishes the callback authentication process.
   */
  protected async finishAuthentication(
    connection: Connection,
    credentials: MongoCredentials,
    token: string,
    conversationId?: number
  ): Promise<Document> {
    const result = await connection.command(
      ns(credentials.source),
      finishCommandDocument(token, conversationId),
      undefined
    );
    return result;
  }

  protected async executeAndValidateCallback(
    callback: OIDCCallbackFunction,
    params: OIDCCallbackParams
  ): Promise<OIDCResponse> {
    // With no token in the cache we use the request callback.
    const result = await callback(params);
    // Validate that the result returned by the callback is acceptable. If it is not
    // we must clear the token result from the cache.
    if (isCallbackResultInvalid(result)) {
      throw new MongoMissingCredentialsError(CALLBACK_RESULT_ERROR);
    }
    return result;
  }
}

/**
 * Determines if a result returned from a request or refresh callback
 * function is invalid. This means the result is nullish, doesn't contain
 * the accessToken required field, and does not contain extra fields.
 */
function isCallbackResultInvalid(tokenResult: unknown): boolean {
  if (tokenResult == null || typeof tokenResult !== 'object') return true;
  if (!('accessToken' in tokenResult)) return true;
  return !Object.getOwnPropertyNames(tokenResult).every(prop => RESULT_PROPERTIES.includes(prop));
}
