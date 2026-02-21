import Fastify, { FastifyInstance } from 'fastify';
import cachePlugin, { CacheService } from '../../src/plugins/cache.plugin.js';

describe('CachePlugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should register and decorate fastify with cache', async () => {
    await app.register(cachePlugin, {});

    expect(app.cache).toBeInstanceOf(CacheService);
  });

  it('should pass options to cache service', async () => {
    await app.register(cachePlugin, {
      maxEntries: 100,
      defaultTtlMs: 5000,
    });

    const cache = app.cache.getCache<string>('test');
    cache.set('key', 'value');

    expect(cache.get('key')).toBe('value');
  });

  it('should clear caches on close', async () => {
    await app.register(cachePlugin, {});

    const cache = app.cache.getCache<string>('test');
    cache.set('key', 'value');

    await app.close();

    expect(cache.size).toBe(0);
  });
});

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService({ maxEntries: 50 });
  });

  afterEach(() => {
    service.clearAll();
  });

  describe('getCache', () => {
    it('should create new cache on first access', () => {
      const cache = service.getCache<string>('users');

      expect(cache).toBeDefined();
      expect(service.hasCache('users')).toBe(true);
    });

    it('should return same cache on subsequent access', () => {
      const cache1 = service.getCache<string>('users');
      const cache2 = service.getCache<string>('users');

      expect(cache1).toBe(cache2);
    });

    it('should apply default options to new caches', () => {
      const serviceWithDefaults = new CacheService({ maxEntries: 2 });
      const cache = serviceWithDefaults.getCache<string>('test');

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Should have evicted due to maxEntries: 2
      expect(cache.size).toBe(2);
    });

    it('should allow per-cache options override', () => {
      const cache = service.getCache<string>('custom', { maxEntries: 1 });

      cache.set('a', '1');
      cache.set('b', '2');

      expect(cache.size).toBe(1);
    });

    it('should support multiple independent caches', () => {
      const users = service.getCache<{ name: string }>('users');
      const sessions = service.getCache<{ token: string }>('sessions');

      users.set('user1', { name: 'Alice' });
      sessions.set('sess1', { token: 'abc123' });

      expect(users.get('user1')).toEqual({ name: 'Alice' });
      expect(sessions.get('sess1')).toEqual({ token: 'abc123' });
      expect(users.get('sess1' as never)).toBeUndefined();
    });
  });

  describe('hasCache', () => {
    it('should return false for non-existent cache', () => {
      expect(service.hasCache('nonexistent')).toBe(false);
    });

    it('should return true for existing cache', () => {
      service.getCache('test');
      expect(service.hasCache('test')).toBe(true);
    });
  });

  describe('deleteCache', () => {
    it('should delete existing cache', () => {
      service.getCache('test');
      expect(service.deleteCache('test')).toBe(true);
      expect(service.hasCache('test')).toBe(false);
    });

    it('should return false for non-existent cache', () => {
      expect(service.deleteCache('nonexistent')).toBe(false);
    });

    it('should clear cache contents before deletion', () => {
      const cache = service.getCache<string>('test');
      cache.set('key', 'value');

      service.deleteCache('test');

      expect(cache.size).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all caches', () => {
      const cache1 = service.getCache<string>('cache1');
      const cache2 = service.getCache<string>('cache2');

      cache1.set('a', '1');
      cache2.set('b', '2');

      service.clearAll();

      expect(cache1.size).toBe(0);
      expect(cache2.size).toBe(0);
      expect(service.getCacheNames()).toEqual([]);
    });
  });

  describe('getCacheNames', () => {
    it('should return empty array when no caches', () => {
      expect(service.getCacheNames()).toEqual([]);
    });

    it('should return all cache names', () => {
      service.getCache('users');
      service.getCache('sessions');
      service.getCache('tokens');

      const names = service.getCacheNames();

      expect(names).toEqual(expect.arrayContaining(['users', 'sessions', 'tokens']));
      expect(names).toHaveLength(3);
    });
  });

  describe('pruneAll', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should prune expired entries from all caches', () => {
      const cache1 = service.getCache<string>('cache1');
      const cache2 = service.getCache<string>('cache2');

      cache1.set('expired1', 'value', { ttlMs: 50 });
      cache1.set('valid1', 'value', { ttlMs: 500 });
      cache2.set('expired2', 'value', { ttlMs: 50 });
      cache2.set('valid2', 'value', { ttlMs: 500 });

      jest.advanceTimersByTime(100);

      const removed = service.pruneAll();

      expect(removed).toBe(2);
      expect(cache1.size).toBe(1);
      expect(cache2.size).toBe(1);
    });
  });
});
