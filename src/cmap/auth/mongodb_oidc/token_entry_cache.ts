import type { IdPServerInfo, IdPServerResponse } from '../mongodb_oidc';

/* 5 minutes in milliseonds */
const EXPIRATION_BUFFER_MS = 300000;
/* Default expiration is now for when no expiration provided */
const DEFAULT_EXPIRATION_SECS = 0;
/** @internal */
export class TokenEntry {
  tokenResult: IdPServerResponse;
  serverInfo: IdPServerInfo;
  expiration: number;

  /**
   * Instantiate the entry.
   */
  constructor(tokenResult: IdPServerResponse, serverInfo: IdPServerInfo, expiration: number) {
    this.tokenResult = tokenResult;
    this.serverInfo = serverInfo;
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
    callbackHash: string,
    tokenResult: IdPServerResponse,
    serverInfo: IdPServerInfo
  ): TokenEntry {
    const entry = new TokenEntry(
      tokenResult,
      serverInfo,
      expirationTime(tokenResult.expiresInSeconds)
    );
    this.entries.set(cacheKey(address, username, callbackHash), entry);
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
  deleteEntry(address: string, username: string, callbackHash: string): void {
    this.entries.delete(cacheKey(address, username, callbackHash));
  }

  /**
   * Get an entry from the cache.
   */
  getEntry(address: string, username: string, callbackHash: string): TokenEntry | undefined {
    return this.entries.get(cacheKey(address, username, callbackHash));
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
 * Get an expiration time in milliseconds past epoch. Defaults to immediate.
 */
function expirationTime(expiresInSeconds?: number): number {
  return Date.now() + (expiresInSeconds ?? DEFAULT_EXPIRATION_SECS) * 1000;
}

/**
 * Create a cache key from the address and username.
 */
function cacheKey(address: string, username: string, callbackHash: string): string {
  return `${address}-${username}-${callbackHash}`;
}
