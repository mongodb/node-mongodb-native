import type { Document } from 'bson';

import type { HostAddress } from '../../../utils';
import type { OIDCRequestTokenResult } from '../mongodb_oidc';

/* 5 minutes in milliseonds */
const EXPIRATION_BUFFER = 300000;
/* 5 hours in seconds */
const DEFAULT_EXPIRATION = 18000;

/** @internal */
interface TokenCacheEntry {
  tokenResult: OIDCRequestTokenResult;
  serverResult: Document;
  expiration: number;
}

/**
 * Cache of tokens and responses for OIDC.
 * @internal
 */
export class TokenCache {
  entries: Map<string, TokenCacheEntry>;

  constructor() {
    this.entries = new Map();
  }

  /**
   * Set an entry in the token cache.
   */
  setEntry(
    tokenResult: OIDCRequestTokenResult,
    serverResult: Document,
    address: HostAddress,
    username = ''
  ): TokenCacheEntry {
    const entry = {
      tokenResult: tokenResult,
      serverResult: serverResult,
      expiration: expirationTime(tokenResult?.expiresInSeconds)
    };
    this.entries.set(cacheKey(address, username), entry);
    return entry;
  }

  /**
   * Get an entry from the cache. Will auto-remove entries if they are
   * expired.
   */
  getEntry(address: HostAddress, username: string): TokenCacheEntry | undefined {
    const key = cacheKey(address, username);
    const entry = this.entries.get(key);
    if (entry) {
      // Check to see if the cache key is expired.
      if (entry.expiration - Date.now() <= EXPIRATION_BUFFER) {
        // Expire entries 5 minutes before their expiration time.
        this.entries.delete(key);
        return undefined;
      }
    }
    return entry;
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
function cacheKey(address: HostAddress, username: string): string {
  return `${address.toString()}-${username}`;
}
