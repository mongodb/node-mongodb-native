/**
 * Base class for OIDC caches.
 */
export abstract class Cache<T> {
  entries: Map<string, T>;

  /**
   * Create a new cache.
   */
  constructor() {
    this.entries = new Map<string, T>();
  }

  /**
   * Clear the cache.
   */
  clear() {
    this.entries.clear();
  }

  /**
   * Create a cache key from the address and username.
   */
  cacheKey(address: string, username: string, callbackHash: string): string {
    return JSON.stringify([address, username, callbackHash]);
  }
}
