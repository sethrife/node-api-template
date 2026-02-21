import { Cache, createCache, CacheStats } from '../../src/utils/cache.js';

describe('Cache', () => {
  describe('basic operations', () => {
    it('should set and get values', () => {
      const cache = createCache<string>();

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return undefined for missing keys', () => {
      const cache = createCache<string>();

      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      const cache = createCache<string>();

      cache.set('key', 'value1');
      cache.set('key', 'value2');

      expect(cache.get('key')).toBe('value2');
    });

    it('should check if key exists with has()', () => {
      const cache = createCache<string>();

      cache.set('key', 'value');

      expect(cache.has('key')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      const cache = createCache<string>();

      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = createCache<string>();

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return size and keys', () => {
      const cache = createCache<string>();

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      expect(cache.size).toBe(3);
      expect(cache.keys()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const cache = createCache<string>();

      cache.set('key', 'value', { ttlMs: 1000 });

      expect(cache.get('key')).toBe('value');

      jest.advanceTimersByTime(1001);

      expect(cache.get('key')).toBeUndefined();
    });

    it('should use default TTL when set', () => {
      const cache = createCache<string>({ defaultTtlMs: 500 });

      cache.set('key', 'value');

      expect(cache.get('key')).toBe('value');

      jest.advanceTimersByTime(501);

      expect(cache.get('key')).toBeUndefined();
    });

    it('should allow per-entry TTL to override default', () => {
      const cache = createCache<string>({ defaultTtlMs: 500 });

      cache.set('short', 'value', { ttlMs: 100 });
      cache.set('long', 'value', { ttlMs: 1000 });

      jest.advanceTimersByTime(200);

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');
    });

    it('should not expire entries without TTL', () => {
      const cache = createCache<string>();

      cache.set('key', 'value');

      jest.advanceTimersByTime(100000);

      expect(cache.get('key')).toBe('value');
    });

    it('should report expired entries in has()', () => {
      const cache = createCache<string>();

      cache.set('key', 'value', { ttlMs: 1000 });

      expect(cache.has('key')).toBe(true);

      jest.advanceTimersByTime(1001);

      expect(cache.has('key')).toBe(false);
    });

    it('should prune expired entries', () => {
      const cache = createCache<string>();

      cache.set('expired1', 'value', { ttlMs: 100 });
      cache.set('expired2', 'value', { ttlMs: 200 });
      cache.set('valid', 'value', { ttlMs: 1000 });

      jest.advanceTimersByTime(300);

      const removed = cache.prune();

      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.get('valid')).toBe('value');
    });
  });

  describe('LRU eviction', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should evict LRU entry when maxEntries exceeded', () => {
      const cache = createCache<string>({ maxEntries: 3 });

      cache.set('a', '1');
      jest.advanceTimersByTime(10);
      cache.set('b', '2');
      jest.advanceTimersByTime(10);
      cache.set('c', '3');
      jest.advanceTimersByTime(10);

      // Access 'a' to make it recently used
      cache.get('a');
      jest.advanceTimersByTime(10);

      // Adding 'd' should evict 'b' (least recently used)
      cache.set('d', '4');

      expect(cache.get('a')).toBe('1');
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('should evict expired entries before LRU entries', () => {
      const cache = createCache<string>({ maxEntries: 3 });

      cache.set('a', '1', { ttlMs: 100 });
      cache.set('b', '2');
      cache.set('c', '3');

      jest.advanceTimersByTime(150);

      // Adding 'd' should evict expired 'a' first
      cache.set('d', '4');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('2');
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('should handle updating existing key without eviction', () => {
      const cache = createCache<string>({ maxEntries: 2 });

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('a', 'updated'); // Should not evict, just update

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBe('updated');
      expect(cache.get('b')).toBe('2');
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cache = createCache<string>();
      const factory = jest.fn(() => 'new value');

      cache.set('key', 'existing');
      const result = await cache.getOrSet('key', factory);

      expect(result).toBe('existing');
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result if not exists', async () => {
      const cache = createCache<string>();
      const factory = jest.fn(() => 'new value');

      const result = await cache.getOrSet('key', factory);

      expect(result).toBe('new value');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cache.get('key')).toBe('new value');
    });

    it('should handle async factory', async () => {
      const cache = createCache<string>();
      const factory = jest.fn(async () => {
        return 'async value';
      });

      const result = await cache.getOrSet('key', factory);

      expect(result).toBe('async value');
      expect(cache.get('key')).toBe('async value');
    });

    it('should respect TTL options', async () => {
      jest.useFakeTimers();
      const cache = createCache<string>();

      await cache.getOrSet('key', () => 'value', { ttlMs: 100 });

      expect(cache.get('key')).toBe('value');

      jest.advanceTimersByTime(150);

      expect(cache.get('key')).toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('stats', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return correct stats for empty cache', () => {
      const cache = createCache<string>();
      const stats = cache.stats();

      expect(stats).toEqual({
        size: 0,
        maxEntries: null,
        expiredCount: 0,
        oldestEntryAge: null,
        newestEntryAge: null,
      });
    });

    it('should return correct stats with entries', () => {
      const cache = createCache<string>({ maxEntries: 100 });

      cache.set('a', '1');
      jest.advanceTimersByTime(100);
      cache.set('b', '2');
      jest.advanceTimersByTime(50);

      const stats = cache.stats();

      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(100);
      expect(stats.expiredCount).toBe(0);
      expect(stats.oldestEntryAge).toBe(150);
      expect(stats.newestEntryAge).toBe(50);
    });

    it('should count expired entries', () => {
      const cache = createCache<string>();

      cache.set('expired', '1', { ttlMs: 50 });
      cache.set('valid', '2', { ttlMs: 200 });

      jest.advanceTimersByTime(100);

      const stats = cache.stats();

      expect(stats.expiredCount).toBe(1);
    });
  });

  describe('createCache factory', () => {
    it('should create a new cache instance', () => {
      const cache = createCache<number>();

      expect(cache).toBeInstanceOf(Cache);
    });

    it('should accept options', () => {
      const cache = createCache<string>({ maxEntries: 10, defaultTtlMs: 5000 });

      expect(cache).toBeInstanceOf(Cache);
    });
  });
});
