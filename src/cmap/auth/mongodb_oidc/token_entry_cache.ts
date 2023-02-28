import type { OIDCMechanismServerStep1, OIDCRequestTokenResult } from '../mongodb_oidc';

/* 5 minutes in milliseonds */
const EXPIRATION_BUFFER_MS = 300000;
/* 5 hours in seconds */
const DEFAULT_EXPIRATION_SECS = 0;

/** @internal */
export class TokenEntry {
  tokenResult: OIDCRequestTokenResult;
  serverResult: OIDCMechanismServerStep1;
  expiration: number;

  /**
   * Instantiate the entry.
   */
  constructor(
    tokenResult: OIDCRequestTokenResult,
    serverResult: OIDCMechanismServerStep1,
    expiration: number
  ) {
    this.tokenResult = tokenResult;
    this.serverResult = serverResult;
    this.expiration = expiration;
  }

  /**
   * The entry is still valid if the expiration is more than
   * 5 minutes from the expiration time.
   */
  isValid() {
    return this.expiration - Date.now() > EXPIRATION_BUFFER_MS;
  }
}

/**
 * Cache of OIDC token entries.
 * @internal
 */
export class TokenEntryCache {
  entries: Map<string, TokenEntry>;

  constructor() {
    this.entries = new Map();
  }

  /**
   * Set an entry in the token cache.
   */
  addEntry(
    address: string,
    username: string,
    tokenResult: OIDCRequestTokenResult,
    serverResult: OIDCMechanismServerStep1
  ): TokenEntry {
    const entry = new TokenEntry(
      tokenResult,
      serverResult,
      expirationTime(tokenResult.expiresInSeconds)
    );
    this.entries.set(cacheKey(address, username), entry);
    return entry;
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Delete an entry from the cache.
   */
  deleteEntry(address: string, username: string): void {
    this.entries.delete(cacheKey(address, username));
  }

  /**
   * Get an entry from the cache.
   */
  getEntry(address: string, username: string): TokenEntry | undefined {
    return this.entries.get(cacheKey(address, username));
  }

  /**
   * Delete all expired entries from the cache.
   */
  deleteExpiredEntries(): void {
    for (const [key, entry] of this.entries) {
      if (!entry.isValid()) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Get an expiration time in milliseconds past epoch. Defaults to 5 hours.
 */
function expirationTime(expiresInSeconds: number = DEFAULT_EXPIRATION_SECS): number {
  return Date.now() + expiresInSeconds * 1000;
}

/**
 * Create a cache key from the address and username.
 */
function cacheKey(address: string, username: string): string {
  return `${address}-${username}`;
}
