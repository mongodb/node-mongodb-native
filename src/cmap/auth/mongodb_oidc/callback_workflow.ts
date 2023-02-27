import { type Document, Binary, BSON } from 'bson';
import { promisify } from 'util';

import { MongoInvalidArgumentError } from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type { OIDCMechanismServerStep1, OIDCRequestTokenResult } from '../mongodb_oidc';
import { AuthMechanism } from '../providers';
import { TokenEntryCache } from './token_entry_cache';
import type { Workflow } from './workflow';

/* 5 minutes in milliseconds */
const TIMEOUT = 300000;

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
  async execute(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    const entry = this.cache.getEntry(connection.address, credentials.username);
    if (entry) {
      // Check if the entry is not expired.
      if (entry.isValid()) {
        // Skip step one and execute the step two saslContinue.
        return finishAuth(entry.tokenResult, undefined, connection, credentials);
      } else {
        // Remove the expired entry from the cache.
        this.cache.deleteEntry(connection.address, credentials.username);
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
      const executeCommand = promisify(connection.command.bind(connection));
      const result = await executeCommand(
        ns(credentials.source),
        startCommandDocument(credentials),
        undefined
      );
      const stepOne = BSON.deserialize(result.payload.buffer) as OIDCMechanismServerStep1;
      // result.conversationId;
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
    const refresh = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // If a refresh callback exists, use it. Otherwise use the request callback.
    if (refresh) {
      const result: OIDCRequestTokenResult = await refresh(
        credentials.username,
        stepOneResult,
        tokenResult,
        TIMEOUT
      );
      // Cache a new entry and continue with the saslContinue.
      this.cache.addEntry(result, stepOneResult, connection.address, credentials.username);
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
    if (request) {
      const tokenResult = await request(credentials.username, stepOneResult, TIMEOUT);
      // Cache a new entry and continue with the saslContinue.
      this.cache.addEntry(tokenResult, stepOneResult, connection.address, credentials.username);
      return finishAuth(tokenResult, conversationId, connection, credentials);
    } else {
      // Request callback must be present.
      throw new MongoInvalidArgumentError(
        'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.'
      );
    }
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
  const executeCommand = promisify(connection.command.bind(connection));
  return executeCommand(
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
  return {
    saslStart: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: new Binary(BSON.serialize({ jwt: token }))
  };
}
