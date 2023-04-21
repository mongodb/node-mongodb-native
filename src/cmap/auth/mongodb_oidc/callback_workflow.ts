import { Binary, BSON, type Document } from 'bson';

import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type {
  OIDCMechanismServerStep1,
  OIDCRefreshFunction,
  OIDCRequestFunction,
  OIDCRequestTokenResult
} from '../mongodb_oidc';
import { AuthMechanism } from '../providers';
import { TokenEntryCache } from './token_entry_cache';
import type { Workflow } from './workflow';

/** 5 minutes in seconds */
const TIMEOUT_S = 300;

/** Properties allowed on results of callbacks. */
const RESULT_PROPERTIES = ['accessToken', 'expiresInSeconds', 'refreshToken'];

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export class CallbackWorkflow implements Workflow {
  cache: TokenEntryCache;

  /**
   * Instantiate the workflow
   */
  constructor() {
    this.cache = new TokenEntryCache();
  }

  /**
   * Get the document to add for speculative authentication. This also needs
   * to add a db field from the credentials source.
   */
  async speculativeAuth(credentials: MongoCredentials): Promise<Document> {
    const document = startCommandDocument(credentials);
    document.db = credentials.source;
    return document;
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    reauthenticating: boolean,
    response?: Document
  ): Promise<Document> {
    const requestCallback = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refreshCallback = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // At minimum a request callback must be provided by the user.
    if (!requestCallback) {
      throw new MongoInvalidArgumentError(
        'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.'
      );
    }
    // Look for an existing entry in the cache.
    const entry = this.cache.getEntry(
      connection.address,
      credentials.username,
      requestCallback,
      refreshCallback || null
    );
    let result;
    // Reauthentication must go through all the steps again regards of a cache entry
    // being present.
    if (entry && !reauthenticating) {
      if (entry.isValid()) {
        // Presence of a valid cache entry means we can skip to the finishing step.
        result = await this.finishAuthentication(connection, credentials, entry.tokenResult);
      } else {
        // Presence of an expired cache entry means we must fetch a new one and
        // then execute the final step.
        const tokenResult = await this.fetchAccessToken(
          connection,
          credentials,
          entry.serverResult,
          requestCallback,
          refreshCallback
        );
        result = await this.finishAuthentication(connection, credentials, tokenResult);
      }
    } else {
      // No entry in the cache requires us to do all authentication steps
      // from start to finish, including getting a fresh token for the cache.
      const startDocument = await this.startAuthentication(connection, credentials, response);
      const conversationId = startDocument.conversationId;
      const serverResult = BSON.deserialize(
        startDocument.payload.buffer
      ) as OIDCMechanismServerStep1;
      const tokenResult = await this.fetchAccessToken(
        connection,
        credentials,
        serverResult,
        requestCallback,
        refreshCallback
      );
      result = await this.finishAuthentication(
        connection,
        credentials,
        tokenResult,
        conversationId
      );
    }
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
    if (response?.speculativeAuthentication) {
      result = response.speculativeAuthentication;
    } else {
      result = await connection.commandAsync(
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
    tokenResult: OIDCRequestTokenResult,
    conversationId?: number
  ): Promise<Document> {
    const result = await connection.commandAsync(
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
    startResult: OIDCMechanismServerStep1,
    requestCallback: OIDCRequestFunction,
    refreshCallback?: OIDCRefreshFunction
  ): Promise<OIDCRequestTokenResult> {
    console.log('FETCH ACCESS TOKEN');
    // Get the token from the cache.
    const entry = this.cache.getEntry(
      connection.address,
      credentials.username,
      requestCallback,
      refreshCallback || null
    );
    console.log('ENTRY', entry);
    let result;
    const clientInfo = { principalName: credentials.username, timeoutSeconds: TIMEOUT_S };
    // Check if there's a token in the cache.
    if (entry) {
      // If the cache entry is valid, return the token result.
      if (entry.isValid()) {
        console.log('ENTRY IS VALID');
        return entry.tokenResult;
      }
      // If the cache entry is not valid, remove it from the cache and first attempt
      // to use the refresh callback to get a new token. If no refresh callback
      // exists, then fallback to the request callback.
      if (refreshCallback) {
        result = await refreshCallback(clientInfo, startResult, entry.tokenResult);
        console.log('USING REFRESH CALLBACK', result);
      } else {
        result = await requestCallback(clientInfo, startResult);
        console.log('USING REQUEST CALLBACK, NO REFRESH FOUND', result);
      }
    } else {
      // With no token in the cache we use the request callback.
      result = await requestCallback(clientInfo, startResult);
      console.log('USING REQUEST CALLBACK, NO TOKEN IN CACHE', result);
    }
    // Validate that the result returned by the callback is acceptable.
    if (isCallbackResultInvalid(result)) {
      throw new MongoMissingCredentialsError(
        'User provided OIDC callbacks must return a valid object with an accessToken.'
      );
    }
    // Cleanup the cache.
    this.cache.deleteExpiredEntries();
    // Put the new entry into the cache.
    this.cache.addEntry(
      connection.address,
      credentials.username || '',
      requestCallback,
      refreshCallback || null,
      result,
      startResult
    );
    return result;
  }
}

/**
 * Generate the finishing command document for authentication. Will be a
 * saslStart or saslContinue depending on the presence of a conversation id.
 */
function finishCommandDocument(token: string, conversationId?: number): Document {
  if (conversationId) {
    return {
      saslContinue: 1,
      conversationId: conversationId,
      payload: new Binary(BSON.serialize({ jwt: token }))
    };
  }
  // saslContinue requires a conversationId in the command to be valid so in this
  // case the server allows "step two" to actually be a saslStart with the token
  // as the jwt since the use of the cached value has no correlating conversating
  // on the particular connection.
  return {
    saslStart: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: new Binary(BSON.serialize({ jwt: token }))
  };
}

/**
 * Determines if a result returned from a request or refresh callback
 * function is invalid. This means the result is nullish, doesn't contain
 * the accessToken required field, and does not contain extra fields.
 */
function isCallbackResultInvalid(tokenResult: any): boolean {
  if (!tokenResult) return true;
  if (!tokenResult.accessToken) return true;
  return !Object.getOwnPropertyNames(tokenResult).every(prop => RESULT_PROPERTIES.includes(prop));
}

/**
 * Generate the saslStart command document.
 */
function startCommandDocument(credentials: MongoCredentials): Document {
  const payload: Document = {};
  if (credentials.username) {
    payload.n = credentials.username;
  }
  return {
    saslStart: 1,
    autoAuthorize: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: new Binary(BSON.serialize(payload))
  };
}
