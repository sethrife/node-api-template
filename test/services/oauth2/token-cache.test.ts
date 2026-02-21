import { TokenCache } from '../../../src/services/oauth2/token-cache.js';
import type { CachedToken } from '../../../src/services/oauth2/types.js';

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    cache = new TokenCache();
  });

  describe('buildKey', () => {
    it('should build key for client credentials', () => {
      const key = cache.buildKey('partner', 'client_credentials');
      expect(key).toBe('partner:client_credentials');
    });

    it('should build key for token exchange with subject', () => {
      const key = cache.buildKey('partner', 'token_exchange', 'user-123');
      expect(key).toBe('partner:token_exchange:user-123');
    });
  });

  describe('get/set/delete', () => {
    it('should store and retrieve tokens', () => {
      const token: CachedToken = {
        accessToken: 'abc123',
        expiresAt: Date.now() + 3600000,
        refreshAt: Date.now() + 2700000,
      };

      cache.set('partner:client_credentials', token);
      const retrieved = cache.get('partner:client_credentials');

      expect(retrieved).toBe(token);
    });

    it('should return undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete tokens', () => {
      const token: CachedToken = {
        accessToken: 'abc123',
        expiresAt: Date.now() + 3600000,
        refreshAt: Date.now() + 2700000,
      };

      cache.set('key', token);
      cache.delete('key');

      expect(cache.get('key')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all tokens', () => {
      cache.set('partner:client_credentials', { accessToken: 'a', expiresAt: 0, refreshAt: 0 });
      cache.set('internal:client_credentials', { accessToken: 'b', expiresAt: 0, refreshAt: 0 });

      cache.clear();

      expect(cache.get('partner:client_credentials')).toBeUndefined();
      expect(cache.get('internal:client_credentials')).toBeUndefined();
    });

    it('should clear only specific provider tokens', () => {
      cache.set('partner:client_credentials', { accessToken: 'a', expiresAt: 0, refreshAt: 0 });
      cache.set('internal:client_credentials', { accessToken: 'b', expiresAt: 0, refreshAt: 0 });

      cache.clear('partner');

      expect(cache.get('partner:client_credentials')).toBeUndefined();
      expect(cache.get('internal:client_credentials')).toBeDefined();
    });
  });

  describe('needsRefresh', () => {
    it('should return true when past refreshAt', () => {
      const token: CachedToken = {
        accessToken: 'abc',
        expiresAt: Date.now() + 3600000,
        refreshAt: Date.now() - 1000, // Past refresh time
      };

      expect(cache.needsRefresh(token)).toBe(true);
    });

    it('should return false when before refreshAt', () => {
      const token: CachedToken = {
        accessToken: 'abc',
        expiresAt: Date.now() + 3600000,
        refreshAt: Date.now() + 2700000,
      };

      expect(cache.needsRefresh(token)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should return true when past expiresAt', () => {
      const token: CachedToken = {
        accessToken: 'abc',
        expiresAt: Date.now() - 1000,
        refreshAt: Date.now() - 2000,
      };

      expect(cache.isExpired(token)).toBe(true);
    });

    it('should return false when before expiresAt', () => {
      const token: CachedToken = {
        accessToken: 'abc',
        expiresAt: Date.now() + 3600000,
        refreshAt: Date.now() + 2700000,
      };

      expect(cache.isExpired(token)).toBe(false);
    });
  });

  describe('refresh promises', () => {
    it('should store and retrieve refresh promises', async () => {
      const promise = Promise.resolve({ accessToken: 'new', expiresAt: 0, refreshAt: 0 });

      cache.setRefreshPromise('key', promise);

      expect(cache.getRefreshPromise('key')).toBe(promise);
    });

    it('should clear refresh promises', () => {
      cache.setRefreshPromise('key', Promise.resolve({ accessToken: 'a', expiresAt: 0, refreshAt: 0 }));
      cache.clearRefreshPromise('key');

      expect(cache.getRefreshPromise('key')).toBeUndefined();
    });
  });
});
