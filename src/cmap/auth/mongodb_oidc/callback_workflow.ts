import { Binary, BSON, type Document } from 'bson';

import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type { OIDCMechanismServerStep1, OIDCRequestTokenResult } from '../mongodb_oidc';
import { AuthMechanism } from '../providers';
import { TokenEntryCache } from './token_entry_cache';
import type { Workflow } from './workflow';

/* 5 minutes in milliseconds */
const TIMEOUT_MS = 300000;

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
   * Get the document to add for speculative authentication. Is empty when
   * callbacks are in play.
   */
  speculativeAuth(): Promise<Document> {
    return Promise.resolve({});
  }

  /**
   * Execute the workflow.
   *
   * Steps:
   * - If an entry is in the cache
   *   - If it is not expired
   *     - Skip step one and use the entry to execute step two.
   *   - If it is expired
   *     - If the refresh callback exists
   *       - remove expired entry from cache
   *       - call the refresh callback.
   *       - put the new entry in the cache.
   *       - execute step two.
   *     - If the refresh callback does not exist.
   *       - remove expired entry from cache
   *       - call the request callback.
   *       - put the new entry in the cache.
   *       - execute step two.
   * - If no entry is in the cache.
   *   - execute step one.
   *   - call the refresh callback.
   *   - put the new entry in the cache.
   *   - execute step two.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    reauthenticate = false
  ): Promise<Document> {
    const request = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refresh = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;

    const entry = this.cache.getEntry(
      connection.address,
      credentials.username,
      request || null,
      refresh || null
    );
    if (entry) {
      // Check if the entry is not expired and if we are reauthenticating.
      if (!reauthenticate && entry.isValid()) {
        // Skip step one and execute the step two saslContinue.
        try {
          const result = await finishAuth(entry.tokenResult, undefined, connection, credentials);
          return result;
        } catch (error) {
          // If authentication errors when using a cached token we remove it from
          // the cache.
          this.cache.deleteEntry(
            connection.address,
            credentials.username || '',
            request || null,
            refresh || null
          );
          throw error;
        }
      } else {
        // Remove the expired entry from the cache.
        this.cache.deleteEntry(
          connection.address,
          credentials.username || '',
          request || null,
          refresh || null
        );
        // Execute a refresh of the token and finish auth.
        return this.refreshAndFinish(
          connection,
          credentials,
          entry.serverResult,
          entry.tokenResult
        );
      }
    } else {
      // No entry means to start with the step one saslStart.
      const result = await connection.commandAsync(
        ns(credentials.source),
        startCommandDocument(credentials),
        undefined
      );
      const stepOne = BSON.deserialize(result.payload.buffer) as OIDCMechanismServerStep1;
      // Call the request callback and finish auth.
      return this.requestAndFinish(connection, credentials, stepOne, result.conversationId);
    }
  }

  /**
   * Execute the refresh callback if it exists, otherwise the request callback, then
   * finish the authentication.
   */
  private async refreshAndFinish(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    tokenResult: OIDCRequestTokenResult,
    conversationId?: number
  ): Promise<Document> {
    const request = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refresh = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // If a refresh callback exists, use it. Otherwise use the request callback.
    if (refresh) {
      const result: OIDCRequestTokenResult = await refresh(
        credentials.username,
        stepOneResult,
        tokenResult,
        TIMEOUT_MS
      );
      // Validate the result.
      if (!result || !result.accessToken) {
        throw new MongoMissingCredentialsError(
          'REFRESH_TOKEN_CALLBACK must return a valid object with an accessToken'
        );
      }
      // Cache a new entry and continue with the saslContinue.
      this.cache.addEntry(
        connection.address,
        credentials.username || '',
        request || null,
        refresh,
        result,
        stepOneResult
      );
      return finishAuth(result, conversationId, connection, credentials);
    } else {
      // Fallback to using the request callback.
      return this.requestAndFinish(connection, credentials, stepOneResult, conversationId);
    }
  }

  /**
   * Execute the request callback and finish authentication.
   */
  private async requestAndFinish(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    conversationId?: number
  ): Promise<Document> {
    // Call the request callback.
    const request = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refresh = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // Always clear expired entries from the cache on each finish as cleanup.
    this.cache.deleteExpiredEntries();
    if (!request) {
      // Request callback must be present.
      throw new MongoInvalidArgumentError(
        'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.'
      );
    }
    const tokenResult = await request(credentials.username, stepOneResult, TIMEOUT_MS);
    // Validate the result.
    if (!tokenResult || !tokenResult.accessToken) {
      throw new MongoMissingCredentialsError(
        'REQUEST_TOKEN_CALLBACK must return a valid object with an accessToken'
      );
    }
    // Cache a new entry and continue with the saslContinue.
    this.cache.addEntry(
      connection.address,
      credentials.username || '',
      request,
      refresh || null,
      tokenResult,
      stepOneResult
    );
    return finishAuth(tokenResult, conversationId, connection, credentials);
  }
}

/**
 * Cache the result of the user supplied callback and execute the
 * step two saslContinue.
 */
async function finishAuth(
  result: OIDCRequestTokenResult,
  conversationId: number | undefined,
  connection: Connection,
  credentials: MongoCredentials
): Promise<Document> {
  // Execute the step two saslContinue.
  return connection.commandAsync(
    ns(credentials.source),
    continueCommandDocument(result.accessToken, conversationId),
    undefined
  );
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

/**
 * Generate the saslContinue command document.
 */
function continueCommandDocument(token: string, conversationId?: number): Document {
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
