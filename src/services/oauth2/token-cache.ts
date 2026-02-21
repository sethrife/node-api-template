import type { CachedToken } from './types.js';

/**
 * In-memory token cache with proactive refresh support
 */
export class TokenCache {
  private cache = new Map<string, CachedToken>();
  private refreshPromises = new Map<string, Promise<CachedToken>>();

  /**
   * Build a cache key from provider, flow type, and optional subject
   */
  buildKey(provider: string, flow: 'client_credentials' | 'token_exchange', subject?: string): string {
    if (subject) {
      return `${provider}:${flow}:${subject}`;
    }
    return `${provider}:${flow}`;
  }

  /**
   * Get a cached token
   */
  get(key: string): CachedToken | undefined {
    return this.cache.get(key);
  }

  /**
   * Store a token in the cache
   */
  set(key: string, token: CachedToken): void {
    this.cache.set(key, token);
  }

  /**
   * Delete a specific token
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear cache - optionally only for a specific provider
   */
  clear(provider?: string): void {
    if (!provider) {
      this.cache.clear();
      this.refreshPromises.clear();
      return;
    }

    // Clear only keys starting with provider
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${provider}:`)) {
        this.cache.delete(key);
      }
    }
    for (const key of this.refreshPromises.keys()) {
      if (key.startsWith(`${provider}:`)) {
        this.refreshPromises.delete(key);
      }
    }
  }

  /**
   * Check if token needs proactive refresh (past 75% of lifetime)
   */
  needsRefresh(token: CachedToken): boolean {
    return Date.now() > token.refreshAt;
  }

  /**
   * Check if token is fully expired
   */
  isExpired(token: CachedToken): boolean {
    return Date.now() > token.expiresAt;
  }

  /**
   * Get an in-progress refresh promise
   */
  getRefreshPromise(key: string): Promise<CachedToken> | undefined {
    return this.refreshPromises.get(key);
  }

  /**
   * Set a refresh promise (to dedupe concurrent refresh attempts)
   */
  setRefreshPromise(key: string, promise: Promise<CachedToken>): void {
    this.refreshPromises.set(key, promise);
  }

  /**
   * Clear a refresh promise
   */
  clearRefreshPromise(key: string): void {
    this.refreshPromises.delete(key);
  }
}
