import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Cache, CacheOptions, createCache } from '../utils/cache.js';

export interface CachePluginOptions extends CacheOptions {
  /** Name for the cache instance (for logging) */
  name?: string;
}

/**
 * Cache service that can manage multiple named caches
 */
export class CacheService {
  private caches = new Map<string, Cache<unknown>>();
  private readonly defaultOptions: CacheOptions;

  constructor(defaultOptions: CacheOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a named cache
   * @param name Cache name
   * @param options Options for this specific cache (only used on first creation)
   */
  getCache<T>(name: string, options?: CacheOptions): Cache<T> {
    let cache = this.caches.get(name);

    if (!cache) {
      cache = createCache<T>({ ...this.defaultOptions, ...options });
      this.caches.set(name, cache);
    }

    return cache as Cache<T>;
  }

  /**
   * Check if a named cache exists
   */
  hasCache(name: string): boolean {
    return this.caches.has(name);
  }

  /**
   * Delete a named cache
   */
  deleteCache(name: string): boolean {
    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();
  }

  /**
   * Get names of all caches
   */
  getCacheNames(): string[] {
    return Array.from(this.caches.keys());
  }

  /**
   * Prune expired entries from all caches
   * @returns Total number of entries removed
   */
  pruneAll(): number {
    let total = 0;
    for (const cache of this.caches.values()) {
      total += cache.prune();
    }
    return total;
  }
}

async function cachePlugin(
  fastify: FastifyInstance,
  options: CachePluginOptions
): Promise<void> {
  const { name = 'cache', ...cacheOptions } = options;

  const cacheService = new CacheService(cacheOptions);

  fastify.decorate('cache', cacheService);

  fastify.addHook('onClose', () => {
    cacheService.clearAll();
    fastify.log.info({ name }, 'Cache service cleared');
  });

  fastify.log.info({ name, options: cacheOptions }, 'Cache plugin registered');
}

export default fp(cachePlugin, {
  fastify: '5.x',
  name: 'cache-plugin',
});
