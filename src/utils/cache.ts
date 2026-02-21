/**
 * General-purpose in-memory cache with LRU eviction and per-entry TTL
 */

export interface CacheOptions {
  /** Maximum number of entries in the cache. When exceeded, LRU entries are evicted. */
  maxEntries?: number;
  /** Default TTL in milliseconds for entries without explicit TTL */
  defaultTtlMs?: number;
}

export interface SetOptions {
  /** TTL in milliseconds for this specific entry. Overrides defaultTtlMs. */
  ttlMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null; // null means no expiration
  createdAt: number;
  lastAccessedAt: number;
}

export class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number | null;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? Infinity;
    this.defaultTtlMs = options.defaultTtlMs ?? null;
  }

  /**
   * Get a value from the cache
   * @returns The cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update last accessed time for LRU
    entry.lastAccessedAt = Date.now();

    return entry.value;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param options Optional settings for this entry
   */
  set(key: string, value: T, options: SetOptions = {}): void {
    const now = Date.now();
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttlMs !== null ? now + ttlMs : null;

    // If key exists, delete it first to reset position in Map iteration order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict if necessary before adding new entry
    this.evictIfNeeded();

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: now,
      lastAccessedAt: now,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from the cache
   * @returns true if the key existed
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (including potentially expired ones)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (including potentially expired ones)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get or set a value using a factory function
   * If the key exists and is not expired, returns the cached value
   * Otherwise, calls the factory to create a new value and caches it
   */
  async getOrSet(
    key: string,
    factory: () => T | Promise<T>,
    options: SetOptions = {}
  ): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * Remove all expired entries from the cache
   * @returns Number of entries removed
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    const now = Date.now();
    let expired = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        expired++;
      }
      if (oldest === null || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
      if (newest === null || entry.createdAt > newest) {
        newest = entry.createdAt;
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries === Infinity ? null : this.maxEntries,
      expiredCount: expired,
      oldestEntryAge: oldest !== null ? now - oldest : null,
      newestEntryAge: newest !== null ? now - newest : null,
    };
  }

  /**
   * Evict LRU entries if cache exceeds maxEntries
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxEntries) {
      return;
    }

    // First, try to remove expired entries
    this.prune();

    // If still over limit, evict LRU entries
    while (this.cache.size >= this.maxEntries) {
      const lruKey = this.findLruKey();
      if (lruKey) {
        this.cache.delete(lruKey);
      } else {
        break;
      }
    }
  }

  /**
   * Find the least recently used key
   */
  private findLruKey(): string | null {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    return lruKey;
  }
}

export interface CacheStats {
  /** Current number of entries */
  size: number;
  /** Maximum allowed entries, or null if unlimited */
  maxEntries: number | null;
  /** Number of expired entries not yet pruned */
  expiredCount: number;
  /** Age of oldest entry in ms, or null if empty */
  oldestEntryAge: number | null;
  /** Age of newest entry in ms, or null if empty */
  newestEntryAge: number | null;
}

/**
 * Create a new cache instance
 */
export function createCache<T>(options?: CacheOptions): Cache<T> {
  return new Cache<T>(options);
}
