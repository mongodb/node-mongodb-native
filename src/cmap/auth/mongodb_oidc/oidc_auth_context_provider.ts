import { MongoInvalidArgumentError } from '../../../error';
import type { Callback } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type { OIDCMechanismServerStep1, OIDCRequestTokenResult } from '../mongodb_oidc';

/* 5 minutes in milliseonds */
const EXPIRATION_BUFFER = 300000;
/* 5 hours in seconds */
const DEFAULT_EXPIRATION = 18000;
/* 5 minutes in milliseconds */
const CALLBACK_TIMEOUT = 300000;

/** @internal */
interface OIDCAuthContext {
  tokenResult: OIDCRequestTokenResult;
  serverResult: OIDCMechanismServerStep1;
  expiration: number;
}

/**
 * Cache of tokens and responses for OIDC.
 * @internal
 */
export class OIDCAuthContextProvider {
  cache: Map<string, OIDCAuthContext>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Set an entry in the token cache.
   */
  addContext(
    tokenResult: OIDCRequestTokenResult,
    serverResult: OIDCMechanismServerStep1,
    address: string,
    username = ''
  ): OIDCAuthContext {
    const context = {
      tokenResult: tokenResult,
      serverResult: serverResult,
      expiration: expirationTime(tokenResult?.expiresInSeconds)
    };
    this.cache.set(cacheKey(address, username), context);
    return context;
  }

  /**
   * Delete a context from the cache.
   */
  deleteContext(address: string, username = ''): void {
    this.cache.delete(cacheKey(address, username));
  }

  /**
   * Get an OIDC auth context. This can be a non-expired cached value or
   * makes use of the request and refresh callbacks to populate the cache
   * and return it.
   */
  getContext(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    callback: Callback<OIDCAuthContext>
  ): void {
    const context = this.cache.get(cacheKey(connection.address, credentials.username));
    if (context) {
      // Check if the context is expired.
      if (context.expiration - Date.now() <= EXPIRATION_BUFFER) {
        // Remove from the cache and call the refresh callback to put a new one in.
        this.deleteContext(connection.address, credentials.username);
        this.refreshToken(connection, credentials, stepOneResult, context, callback);
      }
      callback(undefined, context);
    } else {
      // No context in the cache, use the request callback.
      this.requestToken(connection, credentials, stepOneResult, callback);
    }
  }

  /**
   * Use the user supplied request callback function to attempt to get the OIDC token.
   */
  private requestToken(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    callback: Callback<OIDCAuthContext>
  ): void {
    const requestCallback = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    if (requestCallback) {
      requestCallback(credentials.username, stepOneResult, AbortSignal.timeout(CALLBACK_TIMEOUT))
        .then(result => {
          const context = this.addContext(
            result,
            stepOneResult,
            connection.address,
            credentials.username
          );
          return callback(undefined, context);
        })
        .catch(error => {
          callback(error);
        });
    } else {
      callback(
        new MongoInvalidArgumentError('Auth mechanism property REQUEST_TOKEN_CALLBACK is required.')
      );
    }
  }

  /**
   * Use the user supplied refresh callback function to attempt to get the OIDC token.
   */
  private refreshToken(
    connection: Connection,
    credentials: MongoCredentials,
    stepOneResult: OIDCMechanismServerStep1,
    context: OIDCAuthContext,
    callback: Callback<OIDCAuthContext>
  ): void {
    const refreshCallback = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    if (refreshCallback) {
      refreshCallback(
        credentials.username,
        stepOneResult,
        context.tokenResult,
        AbortSignal.timeout(CALLBACK_TIMEOUT)
      )
        .then(result => {
          const context = this.addContext(
            result,
            stepOneResult,
            connection.address,
            credentials.username
          );
          return callback(undefined, context);
        })
        .catch(error => {
          callback(error);
        });
    } else {
      // Fall back to the request callback if the refresh doesn't exist.
      this.requestToken(connection, credentials, stepOneResult, callback);
    }
  }
}

/**
 * Get an expiration time in milliseconds past epoch. Defaults to 5 hours.
 */
function expirationTime(expiresInSeconds: number = DEFAULT_EXPIRATION): number {
  return Date.now() + expiresInSeconds * 1000;
}

/**
 * Create a cache key from the address and username.
 */
function cacheKey(address: string, username: string): string {
  return `${address}-${username}`;
}
