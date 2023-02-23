import { type Document, BSON } from 'bson';

import { MongoInvalidArgumentError } from '../../../error';
import { type Callback, ns } from '../../../utils';
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
  execute(connection: Connection, credentials: MongoCredentials, callback: Callback): void {
    const entry = this.cache.getEntry(connection.address, credentials.username);
    if (entry) {
      // Check if the entry is not expired.
      if (entry.isValid()) {
        // Skip step one and execute the step two saslContinue.
        finishAuth(entry.tokenResult, connection, credentials, callback);
      } else {
        // Remove the expired entry from the cache.
        this.cache.deleteEntry(connection.address, credentials.username);
        // Execute a refresh of the token and finish auth.
        this.refreshAndFinish(
          connection,
          credentials,
          entry.serverResult,
          entry.tokenResult,
          callback
        );
      }
    } else {
      // No entry means to start with the step one saslStart.
      connection.command(
        ns(credentials.source),
        startCommandDocument(credentials),
        undefined,
        (error, result) => {
          if (error) {
            return callback(error);
          }
          // What to do about the payload?
          console.log('saslStart result', result, BSON.deserialize(result.payload));
          // result.conversationId;
          // Call the request callback and finish auth.
          this.requestAndFinish(connection, credentials, result, callback);
        }
      );
    }
  }

  /**
   * Execute the refresh callback if it exists, otherwise the request callback, then
   * finish the authentication.
   */
  private refreshAndFinish(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    tokenResult: OIDCRequestTokenResult,
    callback: Callback
  ) {
    const refresh = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // If a refresh callback exists, use it. Otherwise use the request callback.
    if (refresh) {
      refresh(credentials.username, stepOneResult, tokenResult, AbortSignal.timeout(TIMEOUT))
        .then(tokenResult => {
          // Cache a new entry and continue with the saslContinue.
          this.cache.addEntry(tokenResult, stepOneResult, connection.address, credentials.username);
          finishAuth(tokenResult, connection, credentials, callback);
        })
        .catch(error => {
          return callback(error);
        });
    } else {
      // Fallback to using the request callback.
      this.requestAndFinish(connection, credentials, stepOneResult, callback);
    }
  }

  /**
   * Execute the request callback and finish authentication.
   */
  private requestAndFinish(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    callback: Callback
  ) {
    // Call the request callback.
    const request = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    if (request) {
      request(credentials.username, stepOneResult, AbortSignal.timeout(TIMEOUT))
        .then(tokenResult => {
          // Cache a new entry and continue with the saslContinue.
          this.cache.addEntry(tokenResult, stepOneResult, connection.address, credentials.username);
          finishAuth(tokenResult, connection, credentials, callback);
        })
        .catch(error => {
          return callback(error);
        });
    } else {
      // Request callback must be present.
      callback(
        new MongoInvalidArgumentError('Auth mechanism property REQUEST_TOKEN_CALLBACK is required.')
      );
    }
  }
}

/**
 * Cache the result of the user supplied callback and execute the
 * step two saslContinue.
 */
function finishAuth(
  result: OIDCRequestTokenResult,
  connection: Connection,
  credentials: MongoCredentials,
  callback: Callback
) {
  // Execute the step two saslContinue.
  connection.command(
    ns(credentials.source),
    continueCommandDocument(result.accessToken),
    undefined,
    (error, result) => {
      if (error) {
        return callback(error);
      }
      // What to do about the payload?
      console.log('saslContinue result', result, BSON.deserialize(result.payload));
      return callback(undefined, result);
    }
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
    payload: BSON.serialize(payload)
  };
}

/**
 * Generate the saslContinue command document.
 */
function continueCommandDocument(token: string): Document {
  return {
    saslContinue: 1,
    //conversationId: conversationId,
    payload: BSON.serialize({ jwt: token })
  };
}
