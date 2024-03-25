import { BSON, type Document } from 'bson';

import { MongoMissingCredentialsError } from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { AuthMechanismProperties, MongoCredentials } from '../mongo_credentials';
import type {
  IdPInfo,
  IdPServerResponse,
  OIDCCallbackFunction,
  OIDCCallbackParams,
  Workflow
} from '../mongodb_oidc';
import { finishCommandDocument, startCommandDocument } from './command_builders';
import { type TokenCache } from './token_cache';

/** The current version of OIDC implementation. */
const OIDC_VERSION = 1;

/** 5 minutes in milliseconds */
const HUMAN_TIMEOUT_MS = 300000;

/** Properties allowed on results of callbacks. */
const RESULT_PROPERTIES = ['accessToken', 'expiresInSeconds', 'refreshToken'];

/** Error message when the callback result is invalid. */
const CALLBACK_RESULT_ERROR =
  'User provided OIDC callbacks must return a valid object with an accessToken.';

const NO_CALLBACK = 'No OIDC_CALLBACK or OIDC_HUMAN_CALLBACK provided for callback workflow.';

/**
 * The OIDC callback information.
 */
interface OIDCCallbackInfo {
  callback: OIDCCallbackFunction;
  isHumanWorkflow: boolean;
}

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export class CallbackWorkflow implements Workflow {
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
    cache?: TokenCache
  ): Promise<Document> {
    // Reauthentication should always remove the access token.
    cache?.remove();
    return this.execute(connection, credentials, cache);
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    cache?: TokenCache,
    response?: Document
  ): Promise<Document> {
    const callbackInfo = getCallback(credentials.mechanismProperties);
    const startDocument = await this.startAuthentication(connection, credentials, response);
    const conversationId = startDocument.conversationId;
    const idpInfo = BSON.deserialize(startDocument.payload.buffer) as IdPInfo;
    // If we are not reauthenticating we can use the token from the cache.
    let tokenResult: IdPServerResponse;
    if (cache?.hasToken()) {
      tokenResult = cache.get();
    } else {
      tokenResult = await this.fetchAccessToken(connection, credentials, idpInfo, callbackInfo);
      cache?.put(tokenResult);
    }
    const result = await this.finishAuthentication(
      connection,
      credentials,
      tokenResult,
      conversationId
    );
    return result;
  }

  /**
   * Starts the callback authentication process. If there is a speculative
   * authentication document from the initial handshake, then we will use that
   * value to get the issuer, otherwise we will send the saslStart command.
   */
  private async startAuthentication(
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
  private async finishAuthentication(
    connection: Connection,
    credentials: MongoCredentials,
    tokenResult: IdPServerResponse,
    conversationId?: number
  ): Promise<Document> {
    const result = await connection.command(
      ns(credentials.source),
      finishCommandDocument(tokenResult.accessToken, conversationId),
      undefined
    );
    return result;
  }

  /**
   * Fetches an access token using either the request or refresh callbacks and
   * puts it in the cache.
   */
  private async fetchAccessToken(
    connection: Connection,
    credentials: MongoCredentials,
    idpInfo: IdPInfo,
    callbackInfo: OIDCCallbackInfo
  ): Promise<IdPServerResponse> {
    const params: OIDCCallbackParams = {
      timeoutContext: AbortSignal.timeout(
        callbackInfo.isHumanWorkflow ? HUMAN_TIMEOUT_MS : HUMAN_TIMEOUT_MS
      ), // TODO: CSOT
      version: OIDC_VERSION,
      idpInfo: idpInfo
    };
    // With no token in the cache we use the request callback.
    const result = await callbackInfo.callback(params);
    // Validate that the result returned by the callback is acceptable. If it is not
    // we must clear the token result from the cache.
    if (isCallbackResultInvalid(result)) {
      throw new MongoMissingCredentialsError(CALLBACK_RESULT_ERROR);
    }
    return result;
  }
}

/**
 * Returns a callback, either machine or human, and a flag whether the workflow is
 * human or not.
 */
function getCallback(mechanismProperties: AuthMechanismProperties): OIDCCallbackInfo {
  if (!mechanismProperties.OIDC_CALLBACK || !mechanismProperties.OIDC_HUMAN_CALLBACK) {
    throw new MongoMissingCredentialsError(NO_CALLBACK);
  }
  if (mechanismProperties.OIDC_CALLBACK) {
    return { callback: mechanismProperties.OIDC_CALLBACK, isHumanWorkflow: false };
  }
  return { callback: mechanismProperties.OIDC_HUMAN_CALLBACK, isHumanWorkflow: true };
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
